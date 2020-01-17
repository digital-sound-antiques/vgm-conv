import { OPLL_VOICES, OPLLVoice, toOPLLVoice } from "./opll-voices";
import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMWriteDataCommand, VGMCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

function getModOffset(ch: number) {
  return 8 * Math.floor(ch / 3) + (ch % 3);
}

function _R(rate: number) {
  // if (8 < rate && rate < 15) return rate + 1;
  return rate;
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

  _buildVoiceSetup(
    ch: number,
    v: OPLLVoice,
    modVolume: number | null,
    carVolume: number | null,
    al: number
  ): { a: number; d: number }[] {
    const modOffset = getModOffset(ch);
    const carOffset = modOffset + 3;
    const mod = v.slots[0];
    const car = v.slots[1];
    return [
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
        d: (mod.kl << 6) | (modVolume ? modVolume : mod.tl)
      },
      {
        a: 0x40 + carOffset,
        d: (car.kl << 6) | (carVolume ? carVolume : car.tl)
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
        d: (mod.sl << 4) | _R(mod.rr)
      },
      {
        a: 0x80 + carOffset,
        d: (car.sl << 4) | _R(car.rr)
      },
      {
        a: 0xc0 + ch,
        d: (this._type === "ymf262" ? 0xf0 : 0) | (v.fb << 1) | al
      },
      { a: 0xe0 + modOffset, d: mod.wf ? 1 : 0 },
      { a: 0xe0 + carOffset, d: car.wf ? 1 : 0 }
    ];
  }

  _rflag: boolean = false;

  _buildInstAndVolume(ch: number) {
    const d = this._regs[0x30 + ch];
    const inst = (d & 0xf0) >> 4;
    const volume = d & 0xf;
    let voice: OPLLVoice;
    if (inst === 0) {
      voice = toOPLLVoice(this._regs);
    } else {
      voice = OPLL_VOICES[inst];
    }

    if (this._rflag && 6 <= ch) {
      switch (ch) {
        case 6:
          this._buildVoiceSetup(6, OPLL_VOICES[16], null, (this._regs[0x36] & 0xf) << 1, 0).forEach(({ a, d }) => {
            this._y(a, d);
          });
          break;
        case 7:
          this._buildVoiceSetup(
            7,
            OPLL_VOICES[17],
            ((this._regs[0x37] >> 4) & 0xf) << 1,
            (this._regs[0x37] & 0xf) << 1,
            1
          ).forEach(({ a, d }) => {
            this._y(a, d);
          });
          break;
        case 8:
          this._buildVoiceSetup(
            8,
            OPLL_VOICES[18],
            ((this._regs[0x38] >> 4) & 0xf) << 1,
            (this._regs[0x38] & 0xf) << 1,
            1
          ).forEach(({ a, d }) => {
            this._y(a, d);
          });
          break;
      }
    } else {
      this._buildVoiceSetup(ch, voice, null, volume << 2, 0).forEach(({ a, d }) => {
        this._y(a, d);
      });
    }
  }

  _convert(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const a = cmd.addr;
    const d = cmd.data;
    this._regs[a & 0xff] = d & 0xff;

    if (a == 0x0e) {
      if (d & 0x20 && !this._rflag) {
        this._rflag = true;
        this._buildInstAndVolume(6);
        this._buildInstAndVolume(7);
        this._buildInstAndVolume(8);
      } else if (!(d & 0x20) && this._rflag) {
        this._rflag = false;
        this._buildInstAndVolume(6);
        this._buildInstAndVolume(7);
        this._buildInstAndVolume(8);
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
      this._y(0xb0 + ch, ((d & 0x1f) << 1) | ((this._regs[0x10 + ch] & 0x80) >> 7));
      this._y(0xa0 + ch, (this._regs[0x10 + ch] & 0x7f) << 1);
    } else if (0x30 <= a && a <= 0x38) {
      const ch = a & 0xf;
      this._buildInstAndVolume(ch);
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
