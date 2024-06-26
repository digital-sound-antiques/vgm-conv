import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand, VGMWriteDataTargetId } from "vgm-parser";

export class AY8910ToYM2203Converter extends VGMConverter {
  constructor(from: ChipInfo, to: ChipInfo, opts: { useTestMode?: boolean; decimation?: number }) {
    super(from, { chip: "ym2203", index: from.index, clock: 2, relativeClock: true });
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ay8910" && cmd.index === this.from.index) {
      return [cmd.copy({ target: VGMWriteDataTargetId.ym2203 })];
    }
    return [cmd];
  }
}

export class AY8910ToYM2608Converter extends VGMConverter {
  constructor(from: ChipInfo, to: ChipInfo, opts: { useTestMode?: boolean; decimation?: number }) {
    super(from, { chip: "ym2608", index: from.index, clock: 4, relativeClock: true });
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ay8910" && cmd.index === this.from.index) {
      const id = cmd.index == 0 ? VGMWriteDataTargetId.ym2608_p0 : VGMWriteDataTargetId.ym2608_2_p0;
      return [cmd.copy({ target: id })];
    }
    return [cmd];
  }
}
