import { VGM, VGMDataStream, VGMEndCommand, parseVGMCommand } from "vgm-parser";
import { VGMConverter, ChipInfo } from "./converter/vgm-converter";
import { YM2612ToYM2413Converter } from "./converter/ym2612-to-ym2413-converter";
import { YM2413ClockConverter } from "./converter/ym2413-clock-converter";

export function getClockConverter(from: ChipInfo, to: ChipInfo, opts: {}): VGMConverter | null {
  if (from.chip === "ym2413" && to.chip === "ym2413") {
    return new YM2413ClockConverter(from, to.clock, opts);
  }
  return null;
}

export function getChipConverter(from: ChipInfo, to: ChipInfo, opts: {}): VGMConverter | null {
  if (from.chip === "ym2612") {
    if (to.chip === "ym2413") {
      return new YM2612ToYM2413Converter(from, to, opts);
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
    for (const e of converter.convertCommand(cmd)) {
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
  let mid = from;
  let vgm = input;

  console.error(`Input:  ${from.chip}(${from.clock}Hz)`);

  if (mid.chip != to.chip) {
    const chipConverter = getChipConverter(mid, to, opts);
    if (chipConverter) {
      vgm = convert(vgm, chipConverter);
      mid = chipConverter.convertedChipInfo;
    } else {
      throw new Error(`Converter from ${mid.chip} to ${to.chip} is not implemented.`);
    }
  }

  if (mid.clock != to.clock) {
    const clockConverter = getClockConverter(mid, to, opts);
    if (clockConverter) {
      vgm = convert(vgm, clockConverter);
      mid = clockConverter.convertedChipInfo;
    } else {
      throw new Error(`Clock converter for ${to.chip} is not implemented.`);
    }
  }

  const chips: any = vgm.chips;
  if (from.subModule == null) {
    chips[from.chip] = undefined;
  }
  if (chips[mid.chip] == null) {
    chips[mid.chip] = {};
  }
  chips[to.chip].clock = mid.clock;

  console.error(`Output: ${mid.chip}(${mid.clock}Hz)`);
  return vgm;
}
