import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";

abstract class SSGToAY8910Converter extends VGMConverter {
  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertSSG = this.from.subModule == null || this.from.subModule === "ssg";
    const convertFM = this.from.subModule == null || this.from.subModule === "fm";

    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.from.chip && cmd.index === this.from.index) {
      if (cmd.addr < 0x10) {
        if (convertSSG) {
          return [cmd.copy({ cmd: 0xa0 })];
        }
      } else {
        if (convertFM) {
          return [];
        }
      }
    }
    return [cmd];
  }
}

export class YM2203ToAY8910Converter extends SSGToAY8910Converter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ay8910", index: from.index, clock: 1 / 2, relativeClock: true });
  }
}

export class YM2608ToAY8910Converter extends SSGToAY8910Converter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ay8910", index: from.index, clock: 1 / 4, relativeClock: true });
  }
}
