import { ChipInfo, VGMClockConverter } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand, VGMWriteDataTargetId } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

const keyCodeToIndex = [0, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12];
const keyIndexToCode = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];

export class OPMClockConverter extends VGMClockConverter {
  _ratio: number;
  _regs = new Uint8Array(256);
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _keyDiff = 0;
  _lfoDiff = 0;

  constructor(from: ChipInfo, toClock: number, opts: {}) {
    super(from, toClock, 3579545);
    this._ratio = this.to.clock / from.clock;
    this._keyDiff = Math.round(12 * Math.log2(1.0 / this._ratio) * 256);
    /* LFO_FREQ = CLOCK * POWER(2, LFRQ/16 - 32) = CLOCK' * POWER(2, LFRQ'/16 - 32) */
    /* => LFRQ' = 16 * LOG2(CLOCK/CLOCK') + LFRQ */
    this._lfoDiff = Math.round(16 * Math.log2(1.0 / this._ratio));
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const target = this.from.index ? VGMWriteDataTargetId.ym2151_2 : VGMWriteDataTargetId.ym2151;
    const index = this.from.index;
    this._buf.push(new VGMWriteDataCommand({ target, index, port: 0, addr, data: data }), optimize);
  }

  getInitialCommands(): Array<VGMCommand> {
    const lfrq = Math.max(0, Math.min(255, this._lfoDiff));
    this._y(0x18, lfrq);
    return this._buf.commit();
  }

  convertWriteDataCommand(cmd: VGMWriteDataCommand): VGMCommand[] {
    if (this._ratio !== 1.0) {
      this._regs[cmd.addr] = cmd.data;
      if ((0x28 <= cmd.addr && cmd.addr <= 0x2f) || (0x30 <= cmd.addr && cmd.addr <= 0x37)) {
        const ch = cmd.addr - (cmd.addr < 0x30 ? 0x28 : 0x30);
        const orgKeyIndex = keyCodeToIndex[this._regs[0x28 + ch] & 0xf];
        const orgKey = (orgKeyIndex << 8) | (this._regs[0x30 + ch] & 0xfc);
        let octave = (this._regs[0x28 + ch] >> 4) & 0x7;
        let newKey = orgKey + this._keyDiff;
        if (newKey < 0) {
          if (0 < octave) {
            octave--;
            newKey += 12 << 8;
          } else {
            newKey = 0;
          }
        } else if (newKey >= 12 << 8) {
          if (octave < 7) {
            octave++;
            newKey -= 12 << 8;
          } else {
            newKey = (12 << 8) - 1;
          }
        }
        const okc = (octave << 4) | keyIndexToCode[newKey >> 8];
        this._y(0x28 + ch, okc);
        const kf = newKey & 0xfc;
        this._y(0x30 + ch, kf);
        return this._buf.commit();
      } else if (cmd.addr === 0x0f) {
        const nfrq = Math.min(0x1f, Math.round((cmd.data & 0x1f) * this._ratio));
        this._y(cmd.addr, (cmd.data & 0xe0) | nfrq);
        return this._buf.commit();
      } else if (cmd.addr === 0x18) {
        const lfrq = Math.max(0, Math.min(255, Math.round(this._lfoDiff + cmd.data)));
        this._y(cmd.addr, lfrq);
        return this._buf.commit();
      }
    }
    return [cmd];
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.to.chip && cmd.index === this.from.index) {
      return this.convertWriteDataCommand(cmd);
    }
    return [cmd];
  }
}