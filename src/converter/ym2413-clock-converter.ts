import { ChipInfo, VGMClockConverter } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

export class YM2413ClockConverter extends VGMClockConverter {
  _ratio: number;
  _regs = new Uint8Array(256);
  _buf = new VGMWriteDataCommandBuffer(256, 1);

  constructor(from: ChipInfo, toClock: number, opts: {}) {
    super(from, toClock, 3579545);
    this._ratio = this.to.clock / from.clock;
  }

  convertWriteDataCommand(cmd: VGMWriteDataCommand): VGMCommand[] {
    if (this._ratio !== 1.0 && cmd.addr != null) {
      if (0x10 <= cmd.addr && cmd.addr < 0x30) {
        this._regs[cmd.addr] = cmd.data;
        const al = (cmd.addr & 0xf) + 0x10;
        const ah = (cmd.addr & 0xf) + 0x20;
        const fnum = ((this._regs[ah] & 1) << 8) | this._regs[al];
        let new_fnum = Math.round(fnum / this._ratio);
        let new_blk = (this._regs[ah] & 0xe) >> 1;
        while (new_fnum > 0x1ff) {
          new_fnum >>= 1;
          new_blk++;
        }
        if (new_blk > 7) {
          new_blk = 7;
          new_fnum = 0x1ff;
        }
        const dl = new_fnum & 0xff;
        const dh = (this._regs[ah] & 0xf0) | (new_blk << 1) | (new_fnum >> 8);
        this._buf.push(cmd.copy({ addr: ah, data: dh }));
        this._buf.push(cmd.copy({ addr: al, data: dl }));
        return this._buf.commit();
      }
    }
    return [cmd];
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ym2413" && cmd.index === this.from.index) {
      return this.convertWriteDataCommand(cmd);
    }
    return [cmd];
  }
}
