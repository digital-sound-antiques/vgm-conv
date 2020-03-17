import { ChipInfo, VGMClockConverter } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

export class OPLClockConverter extends VGMClockConverter {
  _ratio: number;
  _regs = new Uint8Array(256);
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  constructor(from: ChipInfo, to: ChipInfo, opts: {}) {
    super(from, to.clock, (to.chip === "ymf262" ? 4 : 1) * 3579545);
    this._ratio = this.to.clock / from.clock;
  }

  convertWriteDataCommand(cmd: VGMWriteDataCommand): VGMCommand[] {
    if (this._ratio !== 1.0) {
      if (0xa0 <= cmd.addr && cmd.addr < 0xc0) {
        this._regs[cmd.addr] = cmd.data;
        const al = cmd.addr & 0xaf;
        const ah = (cmd.addr & 0xaf) + 0x10;
        const fnum = ((this._regs[ah] & 3) << 8) | this._regs[al];
        let new_fnum = Math.round(fnum / this._ratio);
        let new_blk = (this._regs[ah] & 0x1c) >> 2;
        while (new_fnum > 0x3ff) {
          new_fnum >>= 1;
          new_blk++;
        }
        if (new_blk > 7) {
          new_blk = 7;
          new_fnum = 0x3ff;
        }
        const dl = new_fnum & 0xff;
        const dh = (this._regs[ah] & 0xe0) | (new_blk << 2) | (new_fnum >> 8);
        this._buf.push(cmd.copy({ addr: ah, data: dh }));
        this._buf.push(cmd.copy({ addr: al, data: dl }));
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
