import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMWriteDataCommand, VGMCommand } from "vgm-parser";

type _OPLType = "y8950" | "ym3526";

function type2cmd(type: _OPLType) {
  switch (type) {
    case "ym3526":
      return 0x5b;
    case "y8950":
      return 0x5c;
    default:
      return 0x5b;
  }
}

export class OPL2ToOPLConverter extends VGMConverter {
  _type: _OPLType;
  _command: number;

  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: to.chip, index: from.index, clock: 1, relativeClock: true });
    this._type = to.chip as _OPLType;
    this._command = type2cmd(this._type);
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && (cmd.chip === "ym3812") && cmd.index === this.from.index) {
      return [cmd.copy({ cmd: this._command })];
    }
    return [cmd];
  }
}
