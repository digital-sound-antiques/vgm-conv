import { VGMConverter, ChipInfo } from "./vgm-converter";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { VGMWriteDataCommand, VGMCommand } from "vgm-parser";
import { OPLVoice, OPNVoice } from "ym-voice";

type _OPLType = "ym3812" | "y8950" | "ym3526" | "ymf262";

function type2cmd(type: _OPLType) {
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

// prettier-ignore
const muteVoice = new OPLVoice({
  fb: 7, con: 0,
  slots: [
    {
      am: 0, pm: 0, eg: 1, kr: 0, ml: 2,
      kl: 0, tl: 26,
      ar: 15, dr: 0, sl: 0, rr: 0, 
      ws: 0
    },
    {
      am: 0, pm: 0, eg: 0, kr: 0, ml: 2,
      kl: 0, tl: 63, 
      ar: 0, dr: 0, sl: 0, rr:15,
      ws: 0
    }
  ]
});

export class YM2203ToOPLConverter extends VGMConverter {
  _regs = new Uint8Array(256);
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _type: _OPLType;
  _command: number;
  _keyStatus: Array<boolean> = [false, false, false, false, false, false]; // 0..2: FM1-3, 3..5: CH-3 SLOT
  _toClock: number;

  constructor(from: ChipInfo, to: ChipInfo, opts: { useTestMode?: boolean; decimation?: number }) {
    super(from, { chip: to.chip, index: from.index, clock: to.chip === "ymf262" ? 4 : 1, relativeClock: true });
    this._type = to.chip as _OPLType;
    this._command = type2cmd(this._type);
    this._toClock = this.convertedChipInfo.clock;
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const index = this.from.index;
    this._buf.push(new VGMWriteDataCommand({ cmd: this._command, index, addr, data }), optimize);
  }

  getInitialCommands(): Array<VGMCommand> {
    this._y(0x01, 0x20); // YM3812 mode
    this._y(0x0e, 0x00); // no rhythm
    return this._buf.commit();
  }

  _setVoice(opl_ch: number, v: OPLVoice) {
    const b = v.encode();
    const o = Math.floor(opl_ch / 3) * 8 + (opl_ch % 3);

    this._y(0x20 + o, b[0]);
    this._y(0x23 + o, b[1]);

    this._y(0x40 + o, b[2]);
    this._y(0x43 + o, b[3]);

    this._y(0x60 + o, b[4]);
    this._y(0x63 + o, b[5]);

    this._y(0x80 + o, b[6]);
    this._y(0x83 + o, b[7]);

    this._y(0xe0 + o, b[8]);
    this._y(0xe3 + o, b[9]);

    this._y(0xc0 + opl_ch, b[10]);
  }

  _updateVoice(ch: number) {
    const key = this._keyStatus[ch];
    const regs = this._regs;
    // prettier-ignore
    const opnVoice = OPNVoice.decode([
      regs[0x30 + ch], regs[0x38 + ch], regs[0x34 + ch], regs[0x3c + ch],
      regs[0x40 + ch], regs[0x48 + ch], regs[0x44 + ch], regs[0x4c + ch],
      regs[0x50 + ch], regs[0x58 + ch], regs[0x54 + ch], regs[0x5c + ch],
      regs[0x60 + ch], regs[0x68 + ch], regs[0x64 + ch], regs[0x6c + ch],
      regs[0x70 + ch], regs[0x78 + ch], regs[0x74 + ch], regs[0x7c + ch],
      regs[0x80 + ch], regs[0x88 + ch], regs[0x84 + ch], regs[0x8c + ch],
      regs[0x90 + ch], regs[0x98 + ch], regs[0x94 + ch], regs[0x9c + ch],
      regs[0xb0 + ch], regs[0xb4 + ch]
    ]);
    const oplVoices = opnVoice.toOPL(key);
    this._setVoice(ch * 2, oplVoices[0]);
    this._setVoice(ch * 2 + 1, oplVoices[1]);
  }

  _updateKeyBlkFnum(ch: number) {
    const key = this._keyStatus[ch];
    this._updateVoice(ch);

    const blk_fnum = ((this._regs[0xa4 + ch] << 8) | this._regs[0xa0 + ch]) >> 1;
    const dl = blk_fnum & 0xff;
    const dh = ((blk_fnum >> 8) & 0x1f) | (key ? 0x20 : 0);
    this._y(0xa0 + ch * 2, dl);
    this._y(0xa0 + ch * 2 + 1, dl);
    this._y(0xb0 + ch * 2, dh);
    this._y(0xb0 + ch * 2 + 1, dh);
  }

  _updateSSGTone(ch: number) {
    const t = ((1 << ch) & this._regs[0x7]) === 0;
    const n = ((8 << ch) & this._regs[0x7]) === 0;
    const v = this._regs[0x08 + ch];
    const vol = v & 0x10 ? 0 : v & 0xf;
    const tl = Math.min(63, [63, 62, 56, 52, 46, 42, 36, 32, 28, 24, 20, 16, 12, 8, 4, 0][vol & 0xf]);
    const np = this._regs[0x06] & 0x1f;
    let ssgVoice: OPLVoice;
    if (t && !n) {
      ssgVoice = new OPLVoice({
        fb: 7,
        con: 0,
        slots: [
          { am: 0, pm: 0, eg: 1, kr: 0, ml: 2, kl: 0, tl: 27, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 },
          { am: 0, pm: 0, eg: 1, kr: 0, ml: 1, kl: 0, tl: tl, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 }
        ]
      });
    } else if (!t && n) {
      ssgVoice = new OPLVoice({
        fb: 7,
        con: 0,
        slots: [
          { am: 0, pm: 0, eg: 1, kr: 0, ml: np >> 1, kl: 0, tl: np >> 4, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 },
          { am: 0, pm: 0, eg: 1, kr: 0, ml: np >> 1, kl: 0, tl: tl, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 }
        ]
      });
    } else if (t && n) {
      ssgVoice = new OPLVoice({
        fb: 7,
        con: 0,
        slots: [
          { am: 0, pm: 0, eg: 1, kr: 0, ml: 2, kl: 0, tl: 27, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 },
          { am: 0, pm: 0, eg: 1, kr: 0, ml: 1, kl: 0, tl: tl, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 }
        ]
      });
    } else {
      ssgVoice = new OPLVoice({
        fb: 7,
        con: 0,
        slots: [
          { am: 0, pm: 0, eg: 1, kr: 0, ml: 2, kl: 0, tl: 27, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 },
          { am: 0, pm: 0, eg: 1, kr: 0, ml: 1, kl: 0, tl: 63, ar: 15, dr: 0, sl: 0, rr: 15, ws: 0 }
        ]
      });
    }
    this._setVoice(ch + 6, ssgVoice);
  }

  _convertSSG(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const a = cmd.addr;
    const d = cmd.data;
    this._regs[a & 0xff] = d & 0xff;
    if (a <= 0x05) {
      const ch = a >> 1;
      const tp = (this._regs[ch * 2 + 1] << 8) | this._regs[ch * 2];
      const freq = this.from.clock / (32 * tp);
      let fnum = Math.floor((freq << 19) / (this.from.clock / 72));
      let blk = 1;
      while (fnum > 1023) {
        fnum >>= 1;
        blk++;
      }
      if (blk > 7) blk = 7;
      const dl = fnum & 0xff;
      const dh = 0x20 | (blk << 2) | (fnum >> 8);
      this._y(0xa6 + ch, dl);
      this._y(0xb6 + ch, dh);
    }

    if (a === 0x06 || a === 0x07) {
      this._updateSSGTone(0);
      this._updateSSGTone(1);
      this._updateSSGTone(2);
    }

    if (0x08 <= a && a <= 0x0a) {
      this._updateSSGTone(a - 0x08);
    }

    return this._buf.commit();
  }

  _convertFM(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const a = cmd.addr;
    const d = cmd.data;
    this._regs[a & 0xff] = d & 0xff;
    if (a === 0x28) {
      const ch = d & 3;
      if (ch < 3) {
        const key = d & 0xf0 ? true : false;
        this._keyStatus[ch] = key;
        this._updateKeyBlkFnum(ch);
      }
    } else if (0x30 <= a && a < 0xa0) {
      const ch = a & 3;
      if (ch < 3) {
        this._updateVoice(ch);
      }
    } else if (0xa0 <= a && a < 0xa4) {
      // F-Num 1
      const ch = a - 0xa0;
      if (ch < 3) {
        this._updateKeyBlkFnum(ch);
      }
    } else if (0xa4 <= a && a < 0xa8) {
      // F-Num 2
      const ch = a - 0xa4;
      if (ch < 3) {
        this._updateKeyBlkFnum(ch);
      }
    } else if (0xb0 <= a && a < 0xb4) {
      // FB/CON
      const ch = a - 0xb0;
      if (ch < 3) {
        this._updateVoice(ch);
      }
    } else if (0xb4 <= a && a < 0xb8) {
      // LR/AMS/PMS
    }

    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertFM = this.from.subModule == null || this.from.subModule === "fm";
    const convertSSG = this.from.subModule == null || this.from.subModule === "ssg";
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ym2203" && cmd.index === this.from.index) {
      if (cmd.addr < 0x10) {
        if (convertSSG) {
          return this._convertSSG(cmd);
        }
      } else {
        if (convertFM) {
          return this._convertFM(cmd);
        }
      }
    }
    return [cmd];
  }
}
