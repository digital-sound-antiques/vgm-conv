import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import fs from "fs";
import zlib from "zlib";
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
    header: "AVAILABLE CHIPS",
    content: [
      "Currently conversion only YM2612 to YM2413 is supported.",
      "ym2612, ym2612.fm and ym2612.dac are available for `-f` option.",
      "ym2413 is available for `-t` option."
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
        example: "$ vgm-conv -f ym2612 -t ym2413 -o output.vgm input.vgm"
      },
      {
        desc: "Only DAC part of YM2612 to YM2413",
        example: "$ vgm-conv -f ym2612.dac -t ym2413 -o output.vgm input.vgm"
      },
      {
        desc: "YM2612 to YM2413@4.00MHz",
        example: "$ vgm-conv -f ym2612 -t ym2413 -c 4000000 -o output.vgm input.vgm"
      }
    ]
  }
];

const defineKeys = ["decimation", "useTestMode"];

function toArrayBuffer(b: Buffer) {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

function loadVgmOrVgz(input: string) {
  const buf = fs.readFileSync(input);
  try {
    return zlib.gunzipSync(buf);
  } catch (e) {
    return buf;
  }
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
    if (options.file == null) {
      console.error("Please specify input file. Standard input can not be used on Windows.");
      return;
    }
    if (options.output == null) {
      console.error("Please specify output file. Standard output can not be used on Windows.");
      return;
    }
  }

  const input = options.input || "/dev/stdin";
  const output = options.output;

  const buf = loadVgmOrVgz(input);
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
    clock: options.clock || 0
  };

  const opts = parseDefines(options.define);

  try {
    const converted = convertVGM(vgm, from, to, opts);
    if (options["no-gd3"]) {
      converted.gd3tag = undefined;
    }
    const res = Buffer.from(converted.build());
    if (output) {
      if (/\.vgz/i.test(output)) {
        fs.writeFileSync(output, zlib.gzipSync(res));
      } else {
        fs.writeFileSync(output, res);
      }
    } else {
      process.stdout.write(res);
    }
  } catch (e) {
    throw e;
  }
}

main(process.argv);
