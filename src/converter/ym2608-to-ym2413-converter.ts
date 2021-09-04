import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import { OPNToYM2413Converter } from "./opn-to-ym2413-converter";
import { ChipInfo } from "./vgm-converter";

function _convertRhythmFlags(flags: number) {
  const bd = flags & 1;
  const sd = (flags >> 1) & 1;
  const top = (flags >> 2) & 1;
  const hh = (flags >> 3) & 1;
  const tom = (flags >> 4) & 1;
  const rim = (flags >> 5) & 1;
  return (bd << 4) | (sd << 3) | (tom << 2) | (top << 1) | (rim | hh);
}

export class YM2608ToYM2413Converter extends OPNToYM2413Converter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ym2413", index: from.index, clock: 1 / 2, relativeClock: true }, opts);
  }

  _rkeyStatus = 0;

  _convertRhythmVolume(data: number, offset: number) {
    return (data & 0xc0) ? ((data & 0x1f) >> 2) + offset + (this.opts.rhythmVolume || 0) : 15;
  }

  convertRhythm(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    if (0x10 <= cmd.addr && cmd.addr <= 0x1f) {
      if (cmd.addr == 0x10) {
        const dump = (cmd.data & 0x80) != 0;
        const newStatus = _convertRhythmFlags(cmd.data & 0x3f);
        if (dump) {
          this._rkeyStatus &= ~newStatus;
        } else {
          if (this._rkeyStatus & newStatus) {
            // auto key off
            this._y(14, 32 | (this._rkeyStatus & (~newStatus)), false);
          }
          this._rkeyStatus |= newStatus;
        }
        this._y(14, 32 | this._rkeyStatus, false);
      }
      if (cmd.addr == 0x18) { // BD
        const v = this._convertRhythmVolume(cmd.data, -4);
        this.updateRhythmVolume(16, v);
      }
      if (cmd.addr == 0x19) { // SD
        const v = this._convertRhythmVolume(cmd.data, -4);
        this.updateRhythmVolume(8, v);
      }
      if (cmd.addr == 0x1A) { // TOP
        const v = this._convertRhythmVolume(cmd.data, 0);
        this.updateRhythmVolume(2, v);
      }
      if (cmd.addr == 0x1B) { // HH
        const v = this._convertRhythmVolume(cmd.data, 2);
        this.updateRhythmVolume(1, v);
      }
      if (cmd.addr == 0x1C) { // TOM
        const v = this._convertRhythmVolume(cmd.data, -4);
        this.updateRhythmVolume(4, v);
      }
      if (cmd.addr == 0x1D) { // RIM
        const v = this._convertRhythmVolume(cmd.data, 0);
        this.updateRhythmVolume(2, v);
      }
    }
    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertSSG = this.from.subModule == null || this.from.subModule === "ssg";
    const convertFM = this.from.subModule == null || this.from.subModule === "fm" || this.from.subModule == "fm_r";
    const convertRhythm = this.from.subModule == null || this.from.subModule === "r" || this.from.subModule == "fm_r";

    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ym2608" && cmd.index === this.from.index) {
      if (cmd.addr < 0x10 && cmd.port === 0) {
        if (convertSSG) {
          // Not Supported
          return [];
        }
      } else if (0x10 <= cmd.addr && cmd.addr <= 0x1f && cmd.port == 0) {
        if (convertRhythm) {
          const res = this.convertRhythm(cmd);
          if (res.length > 0) {
            return res;
          }
        }
      } else if (convertFM) {
        return this.convertFM(cmd);
      }
    } else {
      return super.convertCommand(cmd);
    }
    return [cmd];
  }
}
