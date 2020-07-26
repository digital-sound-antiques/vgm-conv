import { VGM, VGMDataStream, VGMEndCommand, parseVGMCommand } from "vgm-parser";
import { VGMConverter, ChipInfo } from "./converter/vgm-converter";
import { YM2413ClockConverter } from "./converter/ym2413-clock-converter";
import { AY8910ClockConverter } from "./converter/ay8910-clock-converter";
import { YM2203ClockConverter, YM2608ClockConverter, YM2612ClockConverter } from "./converter/opn-clock-converter";
import { YM2413ToYM2608Converter } from "./converter/ym2413-to-ym2608-converter";
import { AY8910ToYM2608Converter, AY8910ToYM2203Converter } from "./converter/ay8910-to-ssg-converter";
import { AY8910ToOPLConverter } from "./converter/ay8910-to-opl-converter";
import { YM2413ToOPLConverter } from "./converter/ym2413-to-opl-converter";
import { OPLClockConverter } from "./converter/opl-clock-converter";
import { SN76489ClockConverter } from "./converter/sn76489-clock-converter";
import { SN76489ToAY8910Converter } from "./converter/sn76489-to-ay8910-converter";
import { SN76489ToOPNConverter } from "./converter/sn76489-to-opn-converter";
import { YM2203ToYM2413Converter } from "./converter/ym2203-to-ym2413-converter";
import { YM2608ToYM2413Converter } from "./converter/ym2608-to-ym2413-converter";
import { YM2612ToYM2413Converter } from "./converter/ym2612-to-ym2413-converter";
import { YM2203ToAY8910Converter, YM2608ToAY8910Converter } from "./converter/ssg-to-ay8910-converter";
import { YM2203ToOPLConverter } from "./converter/ym2203-to-opl-converter";

export function getClockConverter(from: ChipInfo, to: ChipInfo, opts: {}): VGMConverter | null {
  if (to.chip === "ym3812" || to.chip === "y8950" || to.chip === "ym3526" || to.chip === "ymf262") {
    return new OPLClockConverter(from, to, opts);
  }
  if (to.chip === "ym2413") {
    return new YM2413ClockConverter(from, to.clock, opts);
  }
  if (to.chip === "ay8910") {
    return new AY8910ClockConverter(from, to.clock, opts);
  }
  if (to.chip === "ym2203") {
    return new YM2203ClockConverter(from, to.clock, opts);
  }
  if (to.chip === "ym2608") {
    return new YM2608ClockConverter(from, to.clock, opts);
  }
  if (to.chip === "ym2612") {
    return new YM2612ClockConverter(from, to.clock, opts);
  }
  if (to.chip === "sn76489") {
    return new SN76489ClockConverter(from, to.clock, opts);
  }
  return null;
}

export function getChipConverter(from: ChipInfo, to: ChipInfo, opts: {}): VGMConverter | null {
  if (from.chip === "ym2612") {
    if (to.chip === "ym2413") {
      return new YM2612ToYM2413Converter(from, to, opts);
    }
  }
  if (from.chip === "ym2203") {
    if (to.chip === "ym3812" || to.chip === "y8950" || to.chip === "ym3526" || to.chip === "ymf262") {
      return new YM2203ToOPLConverter(from, to, opts);
    }
    if (to.chip === "ym2413") {
      return new YM2203ToYM2413Converter(from, to, opts);
    }
    if (to.chip === "ay8910") {
      return new YM2203ToAY8910Converter(from, to, opts);
    }
  }
  if (from.chip === "ym2608") {
    if (to.chip === "ym2413") {
      return new YM2608ToYM2413Converter(from, to, opts);
    }
    if (to.chip === "ay8910") {
      return new YM2608ToAY8910Converter(from, to, opts);
    }
  }

  if (from.chip === "ym2413") {
    if (to.chip === "ym2608") {
      return new YM2413ToYM2608Converter(from, to, opts);
    }
    if (to.chip === "ym3812" || to.chip === "y8950" || to.chip === "ym3526" || to.chip === "ymf262") {
      return new YM2413ToOPLConverter(from, to, opts);
    }
  }
  if (from.chip === "ay8910") {
    if (to.chip === "ym2608") {
      return new AY8910ToYM2608Converter(from, to, opts);
    }
    if (to.chip === "ym2203") {
      return new AY8910ToYM2203Converter(from, to, opts);
    }
    if (to.chip === "ym3812" || to.chip === "y8950" || to.chip === "ym3526" || to.chip === "ymf262") {
      return new AY8910ToOPLConverter(from, to, opts);
    }
  }
  if (from.chip === "sn76489") {
    if (to.chip === "ay8910") {
      return new SN76489ToAY8910Converter(from, to, opts);
    }
    if (to.chip === "ym2203" || to.chip === "ym2608" || to.chip === "ym2612") {
      return new SN76489ToOPNConverter(from, to, opts);
    }
  }
  return null;
}

export function convert(input: VGM, converter: VGMConverter): VGM {
  let index = 0;
  const data = new Uint8Array(input.data);
  const ds = new VGMDataStream();

  for (const e of converter.getInitialCommands()) {
    ds.push(e);
  }

  while (true) {
    if (input.offsets.data + index === input.offsets.loop) {
      ds.markLoopPoint();
    }
    const cmd = parseVGMCommand(data, index);
    if (cmd == null) {
      break;
    }
    for (const e of converter.convert(cmd)) {
      ds.push(e);
    }
    index += cmd.size;
    if (cmd instanceof VGMEndCommand) {
      break;
    }
  }

  const res = input.clone();
  res.setDataStream(ds);
  return res;
}

export default function convertVGM(input: VGM, from: ChipInfo, to: ChipInfo, opts: any): VGM {
  if (input.chips[from.chip] === null) {
    throw new Error(`Cannot find the chip ${from.chip}`);
  }

  let vgm = input.clone();
  vgm.setVersionCode(0x171);

  let cur = from;
  if (cur.chip != to.chip) {
    const chipConverter = getChipConverter(cur, to, opts);
    if (chipConverter) {
      const { clock } = chipConverter.convertedChipInfo;
      if (to.clock != clock) {
        const tmp = { ...cur, clock: (cur.clock * to.clock) / clock };
        const clockConverter = getClockConverter(cur, tmp, opts);
        if (clockConverter) {
          vgm = convert(vgm, clockConverter);
          cur = clockConverter.convertedChipInfo;
        } else {
          throw new Error(`Clock converter for ${to.chip} is not implemented.`);
        }
      }
      chipConverter.from = { ...from, clock: cur.clock };
      vgm = convert(vgm, chipConverter);
      cur = chipConverter.convertedChipInfo;
    } else {
      throw new Error(`Converter from ${cur.chip} to ${to.chip} is not implemented.`);
    }
  } else {
    // clock conversion only
    if (0 < to.clock && cur.clock != to.clock) {
      const clockConverter = getClockConverter(cur, to, opts);
      if (clockConverter) {
        vgm = convert(vgm, clockConverter);
        cur = clockConverter.convertedChipInfo;
      } else {
        throw new Error(`Clock converter for ${to.chip} is not implemented.`);
      }
    }
  }
  const chips: any = vgm.chips;
  if (from.subModule == null) {
    delete chips[from.chip];
  }
  if (chips[cur.chip] == null) {
    chips[cur.chip] = {};
  }
  chips[to.chip].clock = cur.clock;

  console.error(`${from.chip}(${from.clock}Hz) => ${cur.chip}(${cur.clock}Hz)`);
  return vgm;
}
