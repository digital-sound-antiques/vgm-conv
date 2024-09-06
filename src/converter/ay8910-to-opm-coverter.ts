import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMWriteDataCommand, VGMCommand, VGMWriteDataTargetId, VGMWaitCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { freqToOPMNote } from "./opm_freq";

const VOL_TO_TL = [127, 62, 56, 52, 46, 42, 36, 32, 28, 24, 20, 16, 12, 8, 4, 0];
const N_VOL_TO_TL = [127, 126, 125, 124, 123, 122, 121, 120, 116, 112, 105, 96, 82, 64, 37, 0];

const OPM_CH_BASE = 4;

function toOpmCh(psgCh: number) {
  return psgCh + OPM_CH_BASE;
}

export class AY8910ToOPMConverter extends VGMConverter {
  _regs = new Uint8Array(256).fill(0);
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _fdiv: number;
  _clockRatio: number;

  _whiteNoiseAttenuation: number;
  _squareWaveAttenuation: number;

  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, to);
    this._fdiv = from.chip == "ay8910" ? 2 : 4;
    this._clockRatio = 3579545 / this.convertedChipInfo.clock;

    const mainAttenuation = opts.mainAttenuation ?? 0;
    this._whiteNoiseAttenuation = mainAttenuation + (opts.whiteNoiseAttenuation ?? 0);
    this._squareWaveAttenuation = mainAttenuation + (opts.squareWaveAttenuation ?? 8);
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const index = this.from.index;
    this._buf.push(new VGMWriteDataCommand({ target: VGMWriteDataTargetId.ym2151, index, addr, data }), optimize);
  }

  getInitialCommands(): Array<VGMCommand> {
    // PSG TONE
    for (let opmCh = OPM_CH_BASE; opmCh < OPM_CH_BASE + 3; opmCh++) {
      this._y(0x20 + opmCh, 0xfc); // RL=ON FB=7 CON=4
      this._y(0x40 + opmCh, 0x02); // M1: DT=0 ML=2
      this._y(0x50 + opmCh, 0x01); // C1: DT=0 ML=1
      this._y(0x60 + opmCh, 0x1b); // M1: TL=27
      this._y(0x70 + opmCh, 0x7f); // C1: TL=127 (mute)
      this._y(0x80 + opmCh, 0x1f); // M1: AR=31
      this._y(0x90 + opmCh, 0x1f); // C1: AR=31
      this._y(0xa0 + opmCh, 0); // M1: DR=0
      this._y(0xb0 + opmCh, 0); // C1: DR=0
      this._y(0xc0 + opmCh, 0); // M1: DT2=0 SR=0
      this._y(0xd0 + opmCh, 0); // C1: DT2=0 SR=0
      this._y(0xe0 + opmCh, 0); // M1: SL=0 RR=0
      this._y(0xf0 + opmCh, 0); // C1: SL=0 RR=0
      // KEY ON
      this._y(0x08, (0xf << 3) | opmCh, false);
    }

    // for Noise Slot (slot#32)
    {
      const opmCh = 7;
      this._y(0x20 + opmCh, 0xfc); // RL=ON FB=7 CON=4
      this._y(0x58 + opmCh, 0x00); // C2: DT=0 ML=0
      this._y(0x78 + opmCh, 0x7f); // C2: TL=127 (mute)
      this._y(0x98 + opmCh, 0x1f); // C2: AR=31
      this._y(0xb8 + opmCh, 0); // C2: DR=0
      this._y(0xd8 + opmCh, 0); // C2: DT2=0 SR=0
      this._y(0xf8 + opmCh, 0); // C2: SL=0 RR=0
      this._y(0x08, (0x8 << 3) | opmCh, false); // slot32 only
    }

    return this._buf.commit();
  }

  _updateFreq(ch: number, freq: number) {
    const note = freqToOPMNote(freq, this._clockRatio / this._fdiv);
    const opmCh = toOpmCh(ch);
    this._y(0x28 + opmCh, note.kc);
    this._y(0x30 + opmCh, note.kf << 2);
  }

  _nfreq: number = 0;

  _updateNoise() {
    let nVol = 0;
    for (let i = 0; i < 3; i++) {
      if ((this._regs[0x7] & (0x8 << i)) == 0) {
        nVol = Math.max(nVol, this._regs[0x8 + i] & 0xf);
      }
    }
    this._y(0x0f, 0x80 | (0x1f - this._nfreq));
    this._y(0x7f, Math.min(127, N_VOL_TO_TL[nVol] + this._whiteNoiseAttenuation)); // SLOT32
  }

  _updateTone(ch: number) {
    const t = ((1 << ch) & this._regs[0x7]) == 0;
    const opmCh = toOpmCh(ch);
    if (t) {
      const v = this._regs[0x08 + ch];
      const tVol = v & 0x10 ? 0 : v & 0xf;
      this._y(0x70 + opmCh, Math.min(127, VOL_TO_TL[tVol & 0xf] + this._squareWaveAttenuation));
    } else {
      this._y(0x70 + opmCh, 0x7f);
    }
  }

  _convert(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const { addr, data } = cmd;
    this._regs[addr & 0xff] = data & 0xff;
    if (addr <= 0x05) {
      const ch = addr >> 1;
      const tp = (this._regs[ch * 2 + 1] << 8) | this._regs[ch * 2];
      if (tp == 0) {
        this._updateFreq(ch, 0);
      } else {
        const freq = this.from.clock / (16 * tp);
        this._updateFreq(ch, freq);
      }
    } else if (0x08 <= addr && addr <= 0x0a) {
      this._updateTone(addr - 0x08);
      this._updateNoise();
    } else if (addr === 0x06) {
      this._nfreq = this._regs[0x06] & 0x1f;
      this._updateNoise();
    } else if (addr === 0x07) {
      this._updateTone(0);
      this._updateTone(1);
      this._updateTone(2);
      this._updateNoise();
    }

    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.from.chip && cmd.index === this.from.index) {
      return this._convert(cmd);
    }
    return [cmd];
  }
}
