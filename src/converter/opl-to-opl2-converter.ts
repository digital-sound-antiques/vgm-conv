import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMWriteDataCommand, VGMCommand, VGMWriteDataTargetId } from "vgm-parser";

type _OPL2Type = "ym3812" | "ymf262";

function type2cmd(type: _OPL2Type): VGMWriteDataTargetId {
  switch (type) {
    case "ymf262":
      return 0x5e;
    case "ym3812":
    default:
      return 0x5a;
  }
}

export class OPLToOPL2Converter extends VGMConverter {
  _type: _OPL2Type;
  _targetId: VGMWriteDataTargetId;

  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: to.chip, index: from.index, clock: to.chip === "ymf262" ? 4 : 1, relativeClock: true });
    this._type = to.chip as _OPL2Type;
    this._targetId = type2cmd(this._type);
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (
      cmd instanceof VGMWriteDataCommand &&
      (cmd.chip === "ym3526" || cmd.chip === "y8950") &&
      cmd.index === this.from.index
    ) {
      return [cmd.copy({ targetId: this._targetId })];
    }
    return [cmd];
  }
}
