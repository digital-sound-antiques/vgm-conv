import { ChipInfo, VGMClockConverter } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand, ChipName } from "vgm-parser";

export class AY8910ClockConverter extends VGMClockConverter {
  _ratio: number;
  _regs = new Uint8Array(16);
  _outRegs = new Int16Array(16);

  constructor(from: ChipInfo, toClock: number, opts: any) {
    super(from, toClock, 3579545 / 2);
    this._ratio = this.to.clock / from.clock;
    for (let i = 0; i < this._outRegs.length; i++) {
      this._outRegs[i] = -1;
    }
  }

  convertWriteDataCommand(cmd: VGMWriteDataCommand): VGMWriteDataCommand[] {
    const { addr, data } = cmd;
    if (this._ratio !== 1.0 && 0 <= addr && addr < 16) {
      this._regs[addr] = data;
      if (addr < 6) {
        // freq
        const ah = addr | 1;
        const al = addr & 6;
        const raw = ((this._regs[ah] & 0x0f) << 8) | this._regs[al];
        const adj = Math.min(0x0fff, Math.round(raw * this._ratio));
        return [cmd.copy({ addr: al, data: adj & 0xff }), cmd.copy({ addr: ah, data: adj >> 8 })];
      } else if (addr === 6) {
        // noise freq
        const raw = this._regs[6] & 0x1f;
        const adj = Math.min(0xfff, Math.round(raw * this._ratio));
        return [cmd.copy({ data: adj })];
      } else if (addr == 11 || addr == 12) {
        // envelope freq
        const ah = 12;
        const al = 11;
        const raw = (this._regs[ah] << 8) | this._regs[al];
        const adj = Math.min(0xffff, Math.round(raw * this._ratio));
        return [cmd.copy({ addr: al, data: adj & 0xff }), cmd.copy({ addr: ah, data: adj >> 8 })];
      }
    }
    return [cmd];
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.from.chip && cmd.index === this.from.index) {
      return this.convertWriteDataCommand(cmd);
    }
    return [cmd];
  }
}
