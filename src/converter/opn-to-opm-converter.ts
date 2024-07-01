import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand, VGMWriteDataTargetId } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { OPMNote, freqToOPMNote } from "./opm_freq";
import { AY8910ToOPMConverter } from "./ay8910-to-opm-coverter";

export abstract class OPNToOPMConverter extends VGMConverter {
  _regs = [new Uint8Array(256), new Uint8Array(256)];
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _clockRatio: number;
  _lrCache: Array<number> = [0, 0, 0, 0, 0, 0, 0, 0];
  _clockDiv: number;

  constructor(
    from: ChipInfo,
    to: ChipInfo,
    public opts: any,
  ) {
    super(from, to);
    this._clockRatio = 3579545 / this.convertedChipInfo.clock;
    this._clockDiv = from.chip == "ym2203" ? 1.0 : 2.0;
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const index = this.from.index;
    this._buf.push(
      new VGMWriteDataCommand({ target: VGMWriteDataTargetId.ym2151, index, port: 0, addr, data }),
      optimize,
    );
  }

  _fnumToFreq(fnum: number, blk: number): number {
    return (fnum * this.from.clock) / ((72 * this._clockDiv) << (20 - blk));
  }

  _fnumToNote(fnum: number, blk: number): OPMNote {
    const freq = this._fnumToFreq(fnum, blk);
    return freqToOPMNote(freq, this._clockRatio);
  }

  convertFM(cmd: VGMWriteDataCommand): VGMCommand[] {
    const adr = cmd.addr;

    const regs = this._regs[cmd.port];
    regs[adr] = cmd.data;

    if (cmd.port == 0) {
      if (adr == 0x22 && this.from.chip != "ym2203") {
        const lfreq = [0xc2, 0xc9, 0xcb, 0xcd, 0xcf, 0xd6, 0xfb, 0xff][cmd.data & 7];
        this._y(0x18, lfreq);
      } else if (adr == 0x28) {
        const ch = cmd.data & 0x7;
        const slots = (cmd.data & 0xf0) >> 4;
        this._y(0x08, (slots << 3) | ch, false);
      }
    }

    if (0x30 <= adr && adr <= 0x8f) {
      const nch = adr & 3;
      const ch = (cmd.port == 0 ? 0 : 4) + nch;
      const slot = (adr >> 2) & 3;
      const base = 0x40 + ((adr & 0xf0) - 0x30) * 2;
      const offset = slot * 8 + ch;
      this._y(base + offset, cmd.data);
    }

    // FB CON
    if (0xb0 <= adr && adr <= 0xb2) {
      const nch = adr & 3;
      const ch = (cmd.port == 0 ? 0 : 4) + nch;
      // L R FB CON
      this._y(0x20 + ch, (this.getRLFlags(ch) << 6) | (cmd.data & 0x3f));
    }

    // L R AMS PMS
    if (0xb4 <= adr && adr <= 0xb6) {
      const nch = adr & 3;
      const ch = (cmd.port == 0 ? 0 : 4) + nch;
      this._lrCache[ch] = (cmd.data >> 6) & 0x3;
      const ams = (cmd.data >> 4) & 0x3;
      const pms = cmd.data & 0x7;
      // PMS AMS
      this._y(0x38 + ch, (pms << 4) | ams);
      // L R FB CON
      this._y(0x20 + ch, (this.getRLFlags(ch) << 6) | (regs[0xb0 + nch] & 0x3f));
    }

    // F-Number and Block
    if ((0xa0 <= adr && adr <= 0xa2) || (0xa4 <= adr && adr < 0xa6)) {
      const nch = adr & 3;
      const ch = (cmd.port == 0 ? 0 : 4) + nch;
      const al = 0xa0 + nch;
      const ah = 0xa4 + nch;
      const fnum = (((regs[ah] & 7) << 8) | regs[al]) >> 2;
      const blk = (regs[ah] >> 3) & 7;
      const { kc, kf } = this._fnumToNote(fnum, blk);
      this._y(0x28 + ch, kc);
      this._y(0x30 + ch, kf << 2);
    }

    return this._buf.commit();
  }

  getRLFlags(ch: number) {
    if (this.from.chip == "ym2203") {
      return 3;
    }
    const lr = this._lrCache[ch];
    return ((lr & 1) << 1) | ((lr >> 1) & 1);
  }

  getInitialCommands(): Array<VGMCommand> {
    this._y(0x18, 0xc2); // LFO FREQ
    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertFM = this.from.subModule == null || this.from.subModule === "fm";
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.from.chip && cmd.index === this.from.index) {
      if (cmd.addr < 0x10 && cmd.port === 0) {
        // Not Supported
        return [cmd];
      } else {
        if (convertFM) {
          if (this.from.subModule == "fm" && cmd.addr == 0x2b) {
            return [cmd]; // Pass through YM2612 DAC access
          }
          return this.convertFM(cmd);
        }
      }
    }
    return [cmd];
  }
}

export class YM2612ToOPMConverter extends OPNToOPMConverter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ym2151", index: from.index, clock: 1 / 2, relativeClock: true }, opts);
  }
}

export class YM2203ToOPMConverter extends OPNToOPMConverter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    const _to: ChipInfo = { chip: "ym2151", index: from.index, clock: 1, relativeClock: true };
    super(from, _to, opts);
    this._ssgConverter = new AY8910ToOPMConverter(from, _to, {
      mainAttenuation: opts?.ssgAttenuation ?? 0,
      whiteNoiseAttenuation: opts?.whiteNoiseAttenuation,
      squareWaveAttenuation: opts?.squareWaveAttenuation,
    });
  }

  _ssgConverter: AY8910ToOPMConverter;

  getInitialCommands(): VGMCommand[] {
    return [...this._ssgConverter.getInitialCommands(), ...super.getInitialCommands()];
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertSSG = this.from.subModule == null || this.from.subModule == "ssg";
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.from.chip && cmd.index === this.from.index) {
      if (cmd.addr < 0x10 && cmd.port === 0) {
        if (convertSSG) {
          return this._ssgConverter.convertCommand(cmd);
        }
      }
    }
    return super.convertCommand(cmd);
  }
}

export class YM2608ToOPMConverter extends OPNToOPMConverter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ym2151", index: from.index, clock: 1 / 2, relativeClock: true }, opts);
  }
}
