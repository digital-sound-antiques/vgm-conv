import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import fs from "fs";
import path from "path";
import convertVGM from "./index";
import { VGM } from "vgm-parser";

const optionDefinitions = [
  {
    name: "input",
    alias: "i",
    typeLabel: "{underline file}",
    defaultOption: true,
    description: "Input VGM file. Standard input will be used if not specified.",
  },
  { name: "from", alias: "f", typeLabel: "{underline chip}", description: "Specify source chip type.", type: String },
  {
    name: "to",
    alias: "t",
    typeLabel: "{underline chip}",
    description: "Specify destination chip type.",
    type: String,
  },
  {
    name: "clock",
    alias: "c",
    typeLabel: "{underline clock}",
    description: "Specify clock in Hz of destination chip. The typical clock value will be applied if not specified.",
    type: Number,
  },
  {
    name: "define",
    alias: "D",
    typeLabel: "{underline name=value}",
    description: "Define converter option variable. See below.",
    lazyMultiple: true,
    type: String,
  },
  {
    name: "output",
    alias: "o",
    typeLabel: "{underline file}",
    description:
      "Output VGM file. The standard output is used if not speicified. If the given file is *.vgz, the output will be compressed.",
    type: String,
  },
  {
    name: "no-gd3",
    description: "Remove GD3 tag from output.",
    type: Boolean,
  },
  {
    name: "voice-table",
    typeLabel: "{underline file}",
    description: "Specify the voice table file in JavaScript.",
    type: String,
  },
  {
    name: "voiceTable",
    typeLabel: "{underline file}",
    description: "(deprecated) Specify the voice table file in JavaScript.",
    type: String,
  },
  {
    name: "version",
    alias: "v",
    description: "Show version.",
    type: Boolean,
  },
  {
    name: "help",
    alias: "h",
    description: "Show this help.",
    type: Boolean,
  },
];

const sections = [
  {
    header: "vgm-conv",
    content: "Chip-type and clock converter for VGM.",
  },
  {
    header: "SYNOPSIS",
    content: ["{underline vgm-conv} [<option>] <file>"],
  },
  {
    header: "OPTIONS",
    optionList: optionDefinitions,
  },
  {
    header: "CLOCK CONVERSION",
    content: [
      { chip: "{bold AVAILABLE CHIPS}" },
      { chip: "sn76489, ym2612" },
      { chip: "ay8910, ym2151, ym2203, ym2608" },
      { chip: "ym3812, ym3526, y8950, ymf262" },
      { chip: "ym2413" },
    ],
  },
  {
    header: "CHIP CONVERSION",
    content: [
      { from: "{bold FROM}", to: "{bold TO}" },
      { from: "ay8910", to: "ym2203, ym2608, ym3812, y8950, ym3526, ymf262" },
      { from: "sn76489", to: "ay8910, ym2203, ym2608, ym2612" },
      { from: "ym2413", to: "ym2608, ym3812, y8950, ym3526, ymf262" },
      { from: "ym2203, ym2203.fm", to: "ym2413" },
      { from: "ym2608, ym2608.fm, ym2608.r", to: "ym2413" },
      { from: "ym2203.ssg", to: "ay8910" },
      { from: "ym2608.ssg", to: "ay8910" },
      { from: "ym2612, ym2612.fm, ym2612.dac", to: "ym2413" },
      { from: "ym2203, ym2612.fm, ym2608.fm", to: "ym2151" },
      { from: "ym3812", to: "y8950, ym3526, ym2413" },
      { from: "y8950, ym3526", to: "ym3812, ym2413" },
    ],
  },
  {
    header: "YM2203 to OPL (YM3812/Y8950/YM3526/YMF262) OPTIONS",
    content: [
      {
        def: "{bold -D} ssgAttenuation={underline n}",
        desc: "Set SSG volume attenuation level to 0.75*{underline n}(dB). The effective range is -63<={underline n}<=63.",
      },
    ],
  },
  {
    header: "OPN (YM2203/YM2608/YM2612) to YM2413 OPTIONS",
    content: [
      {
        def: "{bold -D} opmOutput={underline filename}",
        desc: "Output VOPM voice file. VOPM voices are only logged if this is included.",
      },
    ],
  },
  {
    header: "AY8910 to YM2151 OPTIONS",
    content: [
      {
        def: "{bold -D} squareWaveAttenuation={underline n}",
        desc: `Volume attenuation for the SSG square tone. The default value is 0.`,
      },
      {
        def: "{bold -D} whiteNoiseAttenuation={underline n}",
        desc: `Volume attenuation for the SSG noice. The default value is 64.`,
      },
    ],
  },
  {
    header: "YM2203 to YM2151 OPTIONS",
    content: [
      {
        def: "{bold -D} squareWaveAttenuation={underline n}",
        desc: `Volume attenuation for the SSG square tone. The default value is 4.`,
      },
      {
        def: "{bold -D} whiteNoiseAttenuation={underline n}",
        desc: `Volume attenuation for the SSG noice. The default value is 68.`,
      },
    ],
  },
  {
    header: "YM2612 to YM2413 OPTIONS",
    content: [
      {
        def: "{bold -D} decimation={underline n}",
        desc: "Decimate 1 of {underline n} PCM data. 2 to 4 is recommended if USB serial device (like SPFM) is used to play VGM. {underline n}=0 disables the feature and results the best playback quality. The default value is 4.",
      },
      {
        def: "{bold -D} dacEmulation=fmpcm|test|none",
        desc: `fmpcm: use the pseudo 6-bit DAC emulation on FM channels is used (default).
               test:  use YM2413 test mode to realize 7.5bit DAC but this disables all FM channels.
               none:  disable DAC emulation (default).`,
      },
    ],
  },
  {
    header: "SN76489 to AY8910 OPTIONS",
    content: [
      {
        def: "{bold -D} mixChannel={underline value}",
        desc: `Specify the AY8910 channel used for noise output. The value must be one of 0, 1, 2 or none. The default value is 2. 
           If 'none' is specified, all noise part will be silent.
           Since AY8910 has no independent noise channel, SN76489's noise channel will be mixed with a tone channel into the single AY8910's channel specified by this option.`,
      },
      {
        def: "{bold -D} mixResolver=tone|noise|mix",
        desc: `This option determines the behavior when tone and noise are requested to be key-on simultaneously on the same AY8910 channel.
               - tone: tone will be output. noise will be silent.
               - noise: noise will be output. tone will be silent.
               - mix: both tone and noise will be output (default).`,
      },
      {
        def: "{bold -D} periodicNoiseAssignment={underline value}",
        desc: `Specify the target to which SN76489's periodic noise will be converted. The {underline value} must be one of the following:
               - tone: square wave (default).
               - noise: white noise. 
               - mix: square wave + white nosie.
               - env.tri: hardware triangle envelope. This will always make volume maximum.
               - env.saw: hardware saw envelope. The will always make volume maximum.
               - none: no output.`,
      },
      {
        def: "{bold -D} periodicNoisePitchShift={underline n}",
        desc: `The pitch shift amount of the periodic noise conversion. pow(2, -{underline n}) will be multiplied to the noise frequency. The default value is 4.`,
      },
      {
        def: "{bold -D} channelAttenuationMap={underline n1},{underline n2},{underline n3},{underline n4}",
        desc: `Volume attenuation mapping for SN76489 channels. {underline n1}, {underline n2}, ... {underline n4} correspond to SN76489's ch1, ch2, ... ch4 respectively. The default value is 0,0,0,0.`,
      },
      {
        def: "{bold -D} whiteNoiseAttenuation={underline n}",
        desc: `Additional volume attenuation for the white noise. This value will be added to the {underline n4} specified on volumeAttenuationMap. The default value is 0.`,
      },
      {
        def: "{bold -D} periodicNoiseAttenuation={underline n}",
        desc: `Additional volume attenuation for periodic noise. This value will be added to the {underline n4} specified on volumeAttenuationMap. The default value is 0.`,
      },
      {
        def: "{bold -D} noisePitchMap={underline n1},{underline n2},{underline n3}",
        desc: `The noise frequency of AY8910. {underline n1}, {underline n2} and {underline n3} correspond to SN76489's noise frequency 0, 1 and 2 respectively. The default value is 7,15,31.`,
      },
    ],
  },
  {
    header: "EXAMPLES",
    content: [
      {
        desc: "YM2612 to YM2413",
        example: "$ vgm-conv -f ym2612 -t ym2413 input.vgm",
      },
      {
        desc: "Both YM2413 and AY8910 to YM2608",
        example: "$ vgm-conv -f ay8910 -t ym2608 input.vgm | vgm-conv -f ym2413 -t ym2608",
      },
      {
        desc: "YM2203's FM part to YM2413 and SSG part to AY8910",
        example: "$ vgm-conv -f ym2203.fm -t ym2413 input.vgm | vgm-conv -f ym2203 -t ay8910",
      },
      {
        desc: "Only DAC part of YM2612 to YM2413",
        example: "$ vgm-conv -f ym2612.dac -t ym2413 input.vgm",
      },
      {
        desc: "YM2612 to YM2413@4.00MHz",
        example: "$ vgm-conv -f ym2612 -t ym2413 -c 4000000 input.vgm",
      },
    ],
  },
];

const defineKeyTypeMap: { [key: string]: any } = {
  decimation: Number,
  dacEmulation: ["fmpcm", "test", "none"],
  mixResolver: ["tone", "noise", "mix"],
  mixChannel: Number,
  opmOutput: String,
  periodicNoiseAssignment: ["tone", "noise", "mix", "env.tri", "env.saw", "none"],
  periodicNoisePitchShift: Number,
  periodicNoiseAttenuation: Number,
  whiteNoiseAttenuation: Number,
  squareWaveAttenuation: Number,
  noisePitchMap: Uint8Array,
  channelAttenuationMap: Uint8Array,
  ssgAttenuation: Number,
};

function toArrayBuffer(b: Buffer) {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

function parseValue(text: string): boolean | string | number | Array<any> {
  if (text.indexOf(",") >= 0) {
    return text.split(",");
  }
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

function parseDefines(defs: Array<string>): { [key: string]: any } {
  const res: any = {};
  for (const def of defs || []) {
    const nv = def.split("=");
    const key = nv[0];
    const keyType = defineKeyTypeMap[nv[0]];
    if (keyType == null) {
      throw Error(`Unknown variable '${key}'`);
    } else if (nv.length < 2) {
      throw Error(`Missing value for '${key}'`);
    } else {
      const value = parseValue(nv[1]);
      if (keyType instanceof Array) {
        if ((keyType as Array<any>).indexOf(value) < 0) {
          throw Error(`Invalid value for ${nv[0]}: ${nv[1]}`);
        }
        res[nv[0]] = value;
      } else if (keyType === Uint8Array) {
        if (value instanceof Array) {
          res[nv[0]] = new Uint8Array(value as Array<any>);
        } else {
          throw Error(`Value for ${nv[0]} must be Array or integers.`);
        }
      } else {
        res[nv[0]] = value;
      }
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
  ymf262: 14318180,
};

function main(argv: string[]) {
  const options = commandLineArgs(optionDefinitions, { argv });
  options.voiceTable = options["voice-table"] || options.voiceTable;

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

  try {
    const buf = fs.readFileSync(input);
    const vgm = VGM.parse(toArrayBuffer(buf));

    const fromCM = (options.from || options.to).split(".");
    const fromChipName = fromCM[0];
    const fromSubModule = fromCM[1];
    const from = {
      index: 0,
      chip: fromChipName,
      subModule: fromSubModule,
      clock: ((vgm.chips as any)[fromChipName] || {}).clock || 0,
    };

    const toCM = (options.to || options.from).split(".");
    const toChipName = toCM[0];
    const to = {
      index: 0,
      chip: toChipName,
      clock: options.clock || defaultClocks[toChipName] || 0,
    };

    const opts = parseDefines(options.define);

    if (options.voiceTable) {
      try {
        const { voiceTable } = require(path.resolve(options.voiceTable));
        opts["voiceTable"] = voiceTable;
      } catch (e) {
        console.error("Error in loading voice table.");
        throw e;
      }
    }

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
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
}

main(process.argv);
