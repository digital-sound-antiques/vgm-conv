import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { OPNSlotParam, OPLLVoiceMap, OPLLVoice } from "ym-voice";

/* level key scaling table */
const KSLTable = [0, 24, 32, 37, 40, 43, 45, 47, 48, 50, 51, 52, 53, 54, 55, 56];

const ROM_VOICES = OPLLVoiceMap.map((e) => { return { opll: e, opn: e.toOPN() }; });

export class YM2413ToYM2608Converter extends VGMConverter {
  constructor(from: ChipInfo, to: ChipInfo, opts: { useTestMode?: boolean; decimation?: number }) {
    super(from, { chip: "ym2608", index: from.index, clock: 2, relativeClock: true });
  }
  _regs = new Uint8Array(256).fill(0);
  _buf = new VGMWriteDataCommandBuffer(256, 2);
  _userVoice = { opll: OPLLVoiceMap[0], opn: OPLLVoiceMap[0].toOPN() };
  _voiceMap = [
    { opll: OPLLVoiceMap[0], opn: OPLLVoiceMap[0].toOPN() },
    { opll: OPLLVoiceMap[0], opn: OPLLVoiceMap[0].toOPN() },
    { opll: OPLLVoiceMap[0], opn: OPLLVoiceMap[0].toOPN() },
    { opll: OPLLVoiceMap[0], opn: OPLLVoiceMap[0].toOPN() },
    { opll: OPLLVoiceMap[0], opn: OPLLVoiceMap[0].toOPN() },
    { opll: OPLLVoiceMap[0], opn: OPLLVoiceMap[0].toOPN() }];

  _y(port: number, addr: number, data: number, optimize: boolean = true) {
    const cmd = (this.from.index == 0 ? 0x56 : 0xa6) + port;
    const index = this.from.index;
    this._buf.push(new VGMWriteDataCommand({ cmd, index, port, addr, data }), optimize);
  }

  getInitialCommands(): Array<VGMCommand> {
    this._y(0, 0x22, 0x0b); // LFO ON 6.02Hz
    this._y(0, 0x29, 0x80); // enable FM 4-6ch
    this._y(0, 0x11, 0x38); // Rhythm TL
    this._y(0, 0x18, 0xdf); // bd TL
    this._y(0, 0x19, 0xdf); // sd TL
    this._y(0, 0x1a, 0xdf); // top TL
    this._y(0, 0x1b, 0xdf); // hh TL
    this._y(0, 0x1c, 0xdf); // tom TL
    this._y(0, 0x1d, 0xdf); // rym TL
    return this._buf.commit();
  }

  _setSlotVolume(port: number, nch: number, blk_fnum: number, volume: number) {
    const ch = port * 3 + nch;
    const fnum_h = (blk_fnum >> 5) & 15;
    const oct = (blk_fnum >> 9) & 7;
    const voice = this._voiceMap[ch];

    /* level key scale emulation */
    const kll = Math.max(0, KSLTable[fnum_h] - 8 * (7 - oct));
    const tll = (vl: number, slot: OPNSlotParam, kl: number) => {
      return Math.min(127, vl + slot.tl + (kl ? kll >> (3 - kl) : 0));
    };
    this._y(port, 0x40 + nch, tll(0, voice.opn.slots[0], voice.opll.slots[0].kl));
    this._y(port, 0x44 + nch, tll(0, voice.opn.slots[1], 0));
    this._y(port, 0x48 + nch, tll(0, voice.opn.slots[2], 0));
    this._y(port, 0x4c + nch, tll(volume << 2, voice.opn.slots[3], voice.opll.slots[1].kl));
  }

  _setInstVolume(port: number, nch: number, iv: number) {
    const inst = iv >> 4;
    const volume = iv & 15;
    const ch = port * 3 + nch;

    const voice = inst === 0 ? this._userVoice : ROM_VOICES[inst];
    this._voiceMap[ch] = voice;

    const opnVoice = voice.opn;

    this._y(port, 0xb0 + nch, (opnVoice.fb << 3) | opnVoice.con);
    this._y(port, 0xb4 + nch, 0xc0 | (opnVoice.ams << 4) | opnVoice.pms);

    for (let i = 0; i < 4; i++) {
      this._y(port, 0x30 + i * 4 + nch, (opnVoice.slots[i].dt << 4) | opnVoice.slots[i].ml);
      this._y(port, 0x50 + i * 4 + nch, (opnVoice.slots[i].ks << 6) | opnVoice.slots[i].ar);
      this._y(port, 0x60 + i * 4 + nch, (opnVoice.slots[i].am << 7) | opnVoice.slots[i].dr);
      this._y(port, 0x70 + i * 4 + nch, opnVoice.slots[i].sr);
      this._y(port, 0x80 + i * 4 + nch, (opnVoice.slots[i].sl << 4) | opnVoice.slots[i].rr);
    }
    const blk_fnum = ((this._regs[0x20 + ch] & 0xf) << 8) | this._regs[0x10 + ch];
    this._setSlotVolume(port, nch, blk_fnum, volume);
  }

  _convert(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const a = cmd.addr;
    const d = cmd.data;

    if (a < 0x08) {
      this._regs[a] = d;
      const opllVoice = OPLLVoice.decode(this._regs);
      this._userVoice = { opll: opllVoice, opn: opllVoice.toOPN() };
      for (let ch = 0; ch < 6; ch++) {
        const iv = this._regs[0x30 + ch];
        if (iv >> 4 === 0) {
          const port = ch < 3 ? 0 : 1;
          const nch = (3 <= ch ? ch + 1 : ch) & 3;
          this._setInstVolume(port, nch, iv);
        }
      }
    } else if (a === 0x0e) {
      if (d & 32) {
        const prev = this._regs[0x0e];
        const hh = ~prev & d & 1;
        const top = (~prev & d & 2) >> 1;
        const tom = (~prev & d & 4) >> 2;
        const sd = (~prev & d & 8) >> 3;
        const bd = (~prev & d & 16) >> 4;
        this._y(0, 0x10, (tom << 4) | (hh << 3) | (top << 2) | (sd << 1) | bd, false);
      } else {
        this._y(0, 0x10, 0xff, false);
      }
      this._regs[a] = d;
    } else if (0x10 <= a && a < 0x16) {
      // F-Num 1
      const ch = a - 0x10;
      const port = ch < 3 ? 0 : 1;
      const nch = (3 <= ch ? ch + 1 : ch) & 3;

      const al = 0xa0 + nch;
      const ah = 0xa4 + nch;
      const blk_fnum = ((this._regs[0x20 + ch] & 0xf) << 8) | d;
      this._y(port, ah, blk_fnum >> 6, false);
      this._y(port, al, (blk_fnum << 2) & 0xff, false);
      this._regs[a] = d;
      this._setSlotVolume(port, nch, blk_fnum, this._regs[0x30 + ch] & 0xf);
    } else if (0x20 <= a && a < 0x26) {
      // BLOCK & F-Num 2
      const ch = a - 0x20;
      const port = ch < 3 ? 0 : 1;
      const nch = (3 <= ch ? ch + 1 : ch) & 3;

      const al = 0xa0 + nch;
      const blk_fnum = ((d & 0xf) << 8) | this._regs[0x10 + ch];
      const ah = 0xa4 + nch;
      const prevKey = (this._regs[0x20 + ch] >> 4) & 1;
      const nextKey = (d >> 4) & 1;
      this._y(port, ah, blk_fnum >> 6, false);
      this._y(port, al, (blk_fnum << 2) & 0xff, false);
      this._setSlotVolume(port, nch, blk_fnum, this._regs[0x30 + ch] & 0xf);
      if (prevKey != nextKey) {
        this._y(0, 0x28, (nextKey ? 0xf0 : 0) | (port * 4 + nch), false);
      }
      this._regs[a] = d;
    } else if (0x30 <= a && a < 0x36) {
      // INST & VOLUME
      const ch = a - 0x30;
      const port = ch < 3 ? 0 : 1;
      const nch = (3 <= ch ? ch + 1 : ch) & 3;
      this._setInstVolume(port, nch, d);
      this._regs[a] = d;
    } else if (a === 0x36) {
      const bd_vol = 15 - (d & 0xf);
      this._y(0, 0x18, 0xc0 | (bd_vol << 1));
      this._regs[a] = d;
    } else if (a === 0x37) {
      const sd_vol = 15 - (d & 0xf);
      const hh_vol = 15 - (d >> 4);
      this._y(0, 0x19, 0xc0 | (sd_vol << 1));
      this._y(0, 0x1b, 0xc0 | hh_vol);
      this._regs[a] = d;
    } else if (a === 0x38) {
      const top_vol = 15 - (d & 0xf);
      const tom_vol = 15 - (d >> 4);
      this._y(0, 0x1a, 0xc0 | (top_vol << 1));
      this._y(0, 0x1c, 0xc0 | Math.round(tom_vol * 1.5));
      this._regs[a] = d;
    } else {
      this._regs[a] = d;
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
