import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMWriteDataCommand, VGMCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { OPLLVoice, OPLLVoiceMap } from "ym-voice";

function getModOffset(ch: number) {
  return 8 * Math.floor(ch / 3) + (ch % 3);
}

function _R(rate: number) {
  return rate;
}

function _KLFix(kl: number) {
  switch (kl) {
    case 0:
      return 0;
    case 1:
      return 2;
    case 2:
      return 1;
    default:
      return 3;
  }
}

type OPLType = "ym3812" | "y8950" | "ym3526" | "ymf262";

function type2cmd(type: OPLType) {
  switch (type) {
    case "ym3526":
      return 0x5b;
    case "y8950":
      return 0x5c;
    case "ymf262":
      return 0x5e;
    case "ym3812":
    default:
      return 0x5a;
  }
}

export class YM2413ToOPLConverter extends VGMConverter {
  _regs = new Uint8Array(256).fill(0);
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _type: OPLType;
  _command: number;

  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: to.chip, index: from.index, clock: to.chip === "ymf262" ? 4 : 1, relativeClock: true });
    this._type = to.chip as OPLType;
    this._command = type2cmd(this._type);
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const index = this.from.index;
    this._buf.push(new VGMWriteDataCommand({ cmd: this._command, index, addr, data }), optimize);
  }

  getInitialCommands(): Array<VGMCommand> {
    this._y(0x01, 0x20); // YM3812 mode
    return this._buf.commit();
  }

  _writeVoice(ch: number, v: OPLLVoice, modVolume: number | null, carVolume: number | null, key: boolean) {
    const modOffset = getModOffset(ch);
    const carOffset = modOffset + 3;
    const mod = v.slots[0];
    const car = v.slots[1];
    [
      {
        a: 0x20 + modOffset,
        d: (mod.am << 7) | (mod.pm << 6) | (mod.eg << 5) | (mod.kr << 4) | mod.ml
      },
      {
        a: 0x20 + carOffset,
        d: (car.am << 7) | (car.pm << 6) | (car.eg << 5) | (car.kr << 4) | car.ml
      },
      {
        a: 0x40 + modOffset,
        d: (_KLFix(mod.kl) << 6) | (modVolume ? modVolume : mod.tl)
      },
      {
        a: 0x40 + carOffset,
        d: (_KLFix(car.kl) << 6) | (carVolume ? carVolume : car.tl)
      },
      {
        a: 0x60 + modOffset,
        d: (_R(mod.ar) << 4) | _R(mod.dr)
      },
      {
        a: 0x60 + carOffset,
        d: (_R(car.ar) << 4) | _R(car.dr)
      },
      {
        a: 0x80 + modOffset,
        d: (mod.sl << 4) | (!mod.eg ? _R(mod.rr) : 0)
      },
      {
        a: 0x80 + carOffset,
        d: (car.sl << 4) | _R(car.eg || key ? _R(car.rr) : _R(6))
      },
      {
        a: 0xc0 + ch,
        d: (this._type === "ymf262" ? 0xf0 : 0) | (v.fb << 1)
      },
      { a: 0xe0 + modOffset, d: mod.ws ? 1 : 0 },
      { a: 0xe0 + carOffset, d: car.ws ? 1 : 0 }
    ].forEach(({ a, d }) => {
      this._y(a, d);
    });
  }

  _rflag: boolean = false;

  _updateVoice(ch: number) {
    const d = this._regs[0x30 + ch];
    const inst = (d & 0xf0) >> 4;
    const volume = d & 0xf;
    const voice = inst === 0 ? OPLLVoice.decode(this._regs) : OPLLVoiceMap[inst];
    const key = this._regs[0x20 + ch] & 0x10 ? true : false;

    if (this._rflag && 6 <= ch) {
      switch (ch) {
        case 6:
          this._writeVoice(6, OPLLVoiceMap[16], null, volume << 1, key);
          break;
        case 7:
          this._writeVoice(7, OPLLVoiceMap[17], inst << 1, volume << 1, key);
          break;
        case 8:
          this._writeVoice(8, OPLLVoiceMap[18], inst << 1, volume << 1, key);
          break;
      }
    } else {
      this._writeVoice(ch, voice, null, volume << 2, key);
    }
  }

  _convert(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const a = cmd.addr;
    const d = cmd.data;
    this._regs[a & 0xff] = d & 0xff;

    if (a == 0x0e) {
      if (d & 0x20 && !this._rflag) {
        this._rflag = true;
        this._updateVoice(6);
        this._updateVoice(7);
        this._updateVoice(8);
      } else if (!(d & 0x20) && this._rflag) {
        this._rflag = false;
        this._updateVoice(6);
        this._updateVoice(7);
        this._updateVoice(8);
        this._y(0xbd, 0xc0 | (d & 0x3f));
      } else {
        this._rflag = d & 0x20 ? true : false;
      }
      this._y(0xbd, 0xc0 | (d & 0x3f));
    } else if (0x10 <= a && a <= 0x18) {
      const ch = a & 0xf;
      this._y(0xb0 + ch, ((this._regs[0x20 + ch] & 0x1f) << 1) | ((d & 0x80) >> 7));
      this._y(0xa0 + ch, (d & 0x7f) << 1);
    } else if (0x20 <= a && a <= 0x28) {
      const ch = a & 0xf;
      this._updateVoice(ch);
      this._y(0xb0 + ch, ((d & 0x1f) << 1) | ((this._regs[0x10 + ch] & 0x80) >> 7));
      this._y(0xa0 + ch, (this._regs[0x10 + ch] & 0x7f) << 1);
    } else if (0x30 <= a && a <= 0x38) {
      const ch = a & 0xf;
      this._updateVoice(ch);
    }
    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ym2413" && cmd.index === this.from.index) {
      return this._convert(cmd);
    }
    return [cmd];
  }
}
