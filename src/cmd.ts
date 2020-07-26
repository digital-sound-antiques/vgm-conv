import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import fs from "fs";
import convertVGM from "./index";
import { VGM } from "vgm-parser";

const optionDefinitions = [
  {
    name: "input",
    alias: "i",
    typeLabel: "{underline file}",
    defaultOption: true,
    description: "Input VGM file. Standard input will be used if not specified."
  },
  { name: "from", alias: "f", typeLabel: "{underline chip}", description: "Specify source chip type.", type: String },
  {
    name: "to",
    alias: "t",
    typeLabel: "{underline chip}",
    description: "Specify destination chip type.",
    type: String
  },
  {
    name: "clock",
    alias: "c",
    typeLabel: "{underline clock}",
    description: "Specify clock in Hz of destination chip. The typical clock value will be applied if not specified.",
    type: Number
  },
  {
    name: "define",
    alias: "D",
    typeLabel: "{underline name=value}",
    description: "Define converter option variable. See below.",
    lazyMultiple: true,
    type: String
  },
  {
    name: "output",
    alias: "o",
    typeLabel: "{underline file}",
    description:
      "Output VGM file. The standard output is used if not speicified. If the given file is *.vgz, the output will be compressed.",
    type: String
  },
  {
    name: "no-gd3",
    description: "Remove GD3 tag from output.",
    type: Boolean
  },
  {
    name: "version",
    alias: "v",
    description: "Show version.",
    type: Boolean
  },
  {
    name: "help",
    alias: "h",
    description: "Show this help.",
    type: Boolean
  }
];

const sections = [
  {
    header: "vgm-conv",
    content: "Chip-type and clock converter for VGM."
  },
  {
    header: "SYNOPSIS",
    content: ["{underline vgm-conv} [<option>] <file>"]
  },
  {
    header: "OPTIONS",
    optionList: optionDefinitions
  },
  {
    header: "CLOCK CONVERSION",
    content: [
      { chip: "{bold AVAILABLE CHIPS}" },
      { chip: "sn76489, ym2612" },
      { chip: "ay8910, ym2203, ym2608" },
      { chip: "ym3812, ym3526, y8950, ymf262" },
      { chip: "ym2413" }
    ]
  },
  {
    header: "CHIP CONVERSION",
    content: [
      { from: "{bold FROM}", to: "{bold TO}" },
      { from: "ay8910", to: "ym2203, ym2608, ym3812, y8950, ym3526, ymf262" },
      { from: "sn76489", to: "ay8910, ym2203, ym2608, ym2612" },
      { from: "ym2413", to: "ym2608, ym3812, y8950, ym3526, ymf262" },
      { from: "ym2203, ym2203.fm", to: "ym2413" },
      { from: "ym2608, ym2608.fm", to: "ym2413" },
      { from: "ym2203, ym2203.ssg", to: "ay8910" },
      { from: "ym2608, ym2608.ssg", to: "ay8910" },
      { from: "ym2612, ym2612.fm, ym2612.dac", to: "ym2413" }
    ]
  },
  {
    header: "YM2612 to YM2413 OPTIONS",
    content: [
      {
        def: "{bold -D} decimation={underline n}",
        desc:
          "Decimate 1 of n PCM data. 2 to 4 is recommended if USB serial device (like SPFM) is used to play VGM. n=0 disables the feature and results the best playback quality. The default value is 4."
      },
      {
        def: "{bold -D} useTestMode={underline true|false}",
        desc:
          "If `true`, YM2413 test mode 7.5bit DAC is used but disables all YM2413 FM channels. Otherwise pseudo 6-bit DAC is used. The default value is `false`."
      }
    ]
  },
  {
    header: "EXAMPLES",
    content: [
      {
        desc: "YM2612 to YM2413",
        example: "$ vgm-conv -f ym2612 -t ym2413 input.vgm"
      },
      {
        desc: "Both YM2413 and AY8910 to YM2608",
        example: "$ vgm-conv -f ay8910 -t ym2608 input.vgm | vgm-conv -f ym2413 -t ym2608"
      },
      {
        desc: "YM2203's FM part to YM2413 and SSG part to AY8910",
        example: "$ vgm-conv -f ym2203.fm -t ym2413 input.vgm | vgm-conv -f ym2203 -t ay8910"
      },
      {
        desc: "Only DAC part of YM2612 to YM2413",
        example: "$ vgm-conv -f ym2612.dac -t ym2413 input.vgm"
      },
      {
        desc: "YM2612 to YM2413@4.00MHz",
        example: "$ vgm-conv -f ym2612 -t ym2413 -c 4000000 input.vgm"
      }
    ]
  }
];

const defineKeys = ["decimation", "useTestMode", "autoVoiceMap", "ws"];

function toArrayBuffer(b: Buffer) {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

function parseValue(text: string): boolean | string | number {
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  if (/[0-9]+/.test(text)) {
    return parseInt(text);
  }
  if (/[0-9]+\.[0-9]+/.test(text)) {
    return parseFloat(text);
  }
  return text;
}

function parseDefines(defs: Array<string>): {} {
  const res: any = {};
  for (const def of defs || []) {
    const nv = def.split("=");
    const key = nv[0];
    if (defineKeys.indexOf(nv[0]) < 0) {
      throw Error(`Unknown variable '${key}'`);
    } else if (nv.length < 2) {
      throw Error(`Missing value for '${key}'`);
    } else {
      res[nv[0]] = parseValue(nv[1]);
    }
  }

  return res;
}

const defaultClocks: { [key: string]: number } = {
  ym2413: 3579545,
  ym2608: 7987200,
  ym2612: 7670454,
  ym2151: 4000000,
  ym2203: 4000000,
  ym3812: 3579545,
  ym8950: 3579545,
  ym3526: 3579545,
  ymf262: 14318180
};

function main(argv: string[]) {
  const options = commandLineArgs(optionDefinitions, { argv });

  if (options.version) {
    const json = require("../package.json");
    console.info(json.version);
    return;
  }
  if (options.help || (options.from == null && options.to == null)) {
    console.error(commandLineUsage(sections));
    return;
  }

  if (process.platform === "win32") {
    if (options.input == null) {
      console.error("Please specify '--input' option. Standard input can not be used on Windows.");
      return;
    }
    if (options.output == null) {
      console.error("Please specify '--output' option. Standard output can not be used on Windows.");
      return;
    }
  }

  const input = options.input || "/dev/stdin";
  const output = options.output;

  const buf = fs.readFileSync(input);
  const vgm = VGM.parse(toArrayBuffer(buf));

  const fromCM = (options.from || options.to).split(".");
  const fromChipName = fromCM[0];
  const fromSubModule = fromCM[1];
  const from = {
    index: 0,
    chip: fromChipName,
    subModule: fromSubModule,
    clock: ((vgm.chips as any)[fromChipName] || {}).clock || 0
  };

  const toCM = (options.to || options.from).split(".");
  const toChipName = toCM[0];
  const to = {
    index: 0,
    chip: toChipName,
    clock: options.clock || defaultClocks[toChipName] || 0
  };

  try {
    const opts = parseDefines(options.define);
    const converted = convertVGM(vgm, from, to, opts);
    if (options["no-gd3"]) {
      converted.gd3tag = undefined;
    }
    converted.volumeModifier = 0x00;
    // converted.extraHeader = {
    //   volumes: [
    //     {
    //       chip: "ay8910",
    //       chipId: 18,
    //       paired: false,
    //       flags: 0,
    //       volume: 128,
    //       absolute: false
    //     }
    //   ]
    // };
    const compress = /\.vgz/i.test(output);
    const res = Buffer.from(converted.build({ compress }));
    if (output) {
      fs.writeFileSync(output, res);
    } else {
      process.stdout.write(res);
    }
  } catch (e) {
    console.log(e.message);
  }
}

main(process.argv);
