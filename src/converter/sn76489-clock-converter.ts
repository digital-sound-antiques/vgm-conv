import { ChipInfo, VGMClockConverter } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand, ChipName } from "vgm-parser";

export class SN76489ClockConverter extends VGMClockConverter {
  _freq = new Uint16Array(4);
  _dh = new Uint8Array(4);
  _dl = new Uint8Array(4);
  _ch = 0;
  _type = 0;
  _ratio = 0;

  constructor(from: ChipInfo, toClock: number, opts: any) {
    super(from, toClock, 3579545 / 2);
    this._ratio = this.to.clock / from.clock;
  }

  convertWriteDataCommand(cmd: VGMWriteDataCommand): VGMWriteDataCommand[] {
    const { data } = cmd;
    if (data & 0x80) {
      const ch = (data >> 5) & 3;
      const type = (data >> 4) & 1;
      this._ch = ch;
      this._type = type;

      if (type === 0) {
        if (ch < 3) {
          const freq = (this._freq[ch] & 0x3f0) | (data & 0xf);
          this._freq[ch] = freq;
          const adj_freq = Math.min(0x3ff, Math.round(freq * this._ratio));
          const dl = 0x80 | (ch << 5) | (adj_freq & 0xf);
          this._dl[ch] = dl;
          const dh = adj_freq >> 4;
          if (this._dh[ch] != dh) {
            this._dh[ch] = dh;
            return [
              cmd.copy({ data: dl }),
              cmd.copy({ data: dh }),
              cmd.copy({ data: dl }) // latch again
            ];
          } else {
            return [cmd.copy({ data: dl })];
          }
        }
      }
    } else {
      const ch = this._ch;
      const type = this._type;

      if (type === 0) {
        if (ch < 3) {
          const freq = ((data & 0x3f) << 4) | (this._freq[ch] & 0xf);
          this._freq[ch] = freq;
          const adj_freq = Math.min(0x3ff, Math.round(freq * this._ratio));
          const dl = 0x80 | (ch << 5) | (adj_freq & 0xf);
          const dh = adj_freq >> 4;
          this._dh[ch] = dh;
          if (this._dl[ch] != dl) {
            return [cmd.copy({ data: dl }), cmd.copy({ data: dh })];
          } else {
            return [cmd.copy({ data: dh })];
          }
        }
      }
    }
    return [cmd];
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "sn76489" && cmd.index == this.from.index) {
      return this.convertWriteDataCommand(cmd);
    }
    return [cmd];
  }
}
