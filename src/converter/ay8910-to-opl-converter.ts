import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMWriteDataCommand, VGMCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

function getModOffset(ch: number) {
  return 8 * Math.floor(ch / 3) + (ch % 3);
}

type OPLType = "ym3812" | "y8950" | "ym3526" | "ymf262";

function type2cmd(type: OPLType) {
  switch (type) {
    case "ym3526":
      return 0x5b;
    case "y8950":
      return 0x5c;
    case "ymf262":
      return 0x5f;
    case "ym3812":
    default:
      return 0x5a;
  }
}

export class AY8910ToOPLConverter extends VGMConverter {
  _regs = new Uint8Array(256).fill(0);
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _type: OPLType;
  _command: number;
  _oplClock: number;

  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: to.chip, index: from.index, clock: to.chip === "ymf262" ? 8 : 2, relativeClock: true });
    this._type = to.chip as OPLType;
    this._command = type2cmd(this._type);
    this._oplClock = this.convertedChipInfo.clock;
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const index = this.from.index;
    this._buf.push(new VGMWriteDataCommand({ cmd: this._command, index, addr, data }), optimize);
  }

  getInitialCommands(): Array<VGMCommand> {
    // TONE
    const opl3 = this._type === "ymf262";

    if (opl3) {
      this._buf.push(new VGMWriteDataCommand({ cmd: 0x5e, index: this.from.index, addr: 0x01, data: 0x20 })); // Enable Wave Select
      this._y(0x05, 0x01);
    }

    for (let ch = 0; ch < 3; ch++) {
      const moff = getModOffset(ch);
      const coff = moff + 3;
      this._y(0x20 + moff, 0x02); // ML(mod)
      this._y(0x20 + coff, opl3 ? 0x04 : 0x01); // ML(car)
      this._y(0x40 + moff, 0x1a); // TL(mod)
      this._y(0x40 + coff, 0x3f); // TL(car)
      this._y(0x60 + moff, opl3 ? 0x00 : 0xf0);
      this._y(0x60 + coff, 0xf0);
      this._y(0x80 + moff, 0x00);
      this._y(0x80 + coff, 0x00);
      this._y(0xc0 + ch, opl3 ? 0xfe : 0x0e);
      this._y(0xe0 + coff, opl3 ? 0x06 : 0x00);
    }
    // NOISE
    for (let ch = 3; ch < 6; ch++) {
      const moff = getModOffset(ch);
      const coff = moff + 3;
      this._y(0x20 + moff, 0x0f); // ML(mod)
      this._y(0x20 + coff, 0x0f); // ML(car)
      this._y(0x40 + moff, 0x04); // TL(mod)
      this._y(0x40 + coff, 0x3f); // TL(car)
      this._y(0x60 + moff, 0xf0);
      this._y(0x60 + coff, 0xf0);
      this._y(0x80 + moff, 0x00);
      this._y(0x80 + coff, 0x00);
      this._y(0xc0 + ch, opl3 ? 0xfe : 0x0e);
      this._y(0xe0 + coff, 0x00);
    }
    return this._buf.commit();
  }

  _updateFreq(ch: number, freq: number) {
    let fnum = Math.floor((freq << 19) / (this._oplClock / 72));
    let blk = 1;
    while (fnum > 1023) {
      fnum >>= 1;
      blk++;
    }
    if (blk > 7) blk = 7;
    this._y(0xb0 + ch, 0x20 | ((blk & 7) << 2) | ((fnum >> 8) & 3));
    this._y(0xa0 + ch, fnum & 0xff);
  }

  _updateNoiseFreq(np: number) {
    const fnum = 1024 / (np + 1) - 1;
    const blk = 7;
    for (let ch = 3; ch < 6; ch++) {
      this._y(0xb0 + ch, 0x20 | ((blk & 7) << 2) | ((fnum >> 8) & 3));
      this._y(0xa0 + ch, fnum & 0xff);
    }
  }

  _updateTone(ch: number) {
    const t = ((1 << ch) & this._regs[0x7]) === 0;
    const n = ((8 << ch) & this._regs[0x7]) === 0;
    const v = this._regs[0x08 + ch];
    const vol = v & 0x10 ? 0 : v & 0xf;

    const tl = [63, 62, 56, 52, 46, 42, 36, 32, 28, 24, 20, 16, 12, 8, 4, 0][vol & 0xf];

    const coff = getModOffset(ch) + 3;
    if (t) {
      this._y(0x40 + coff, tl);
    } else {
      this._y(0x40 + coff, 0x3f);
    }

    const coff2 = getModOffset(ch + 3) + 3;
    if (n) {
      this._y(0x40 + coff2, tl);
    } else {
      this._y(0x40 + coff2, 0x3f);
    }
  }

  _convert(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const { addr, data } = cmd;
    this._regs[addr & 0xff] = data & 0xff;
    if (addr <= 0x05) {
      const ch = addr >> 1;
      const tp = (this._regs[ch * 2 + 1] << 8) | this._regs[ch * 2];
      const freq = this.from.clock / (16 * tp);
      this._updateFreq(ch, freq);
    }

    if (0x08 <= addr && addr <= 0x0a) {
      this._updateTone(addr - 0x08);
    }

    if (addr === 0x06) {
      const np = this._regs[0x06] & 0x1f;
      this._updateNoiseFreq(np);
    }

    if (addr === 0x07) {
      this._updateTone(0);
      this._updateTone(1);
      this._updateTone(2);
    }
    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ay8910" && cmd.index === this.from.index) {
      return this._convert(cmd);
    }
    return [cmd];
  }
}
