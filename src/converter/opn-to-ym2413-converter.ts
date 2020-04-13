import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import { toOPNVoice, OPNVoice } from "./opn-voices";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { OPNVoiceToOPLVoice, estimateOPLLVoice } from "./voice-converter";

const fallback_voice = { inst: 0, voff: 0, ooff: 0 };

/** instrument data to voice and volue offset (attenuation) */
const voiceMap: { [key: string]: { inst: number; voff: number; ooff: number } } = {};

export abstract class OPNToYM2413Converter extends VGMConverter {
  _voiceHashMap: { [key: string]: OPNVoice } = {};
  _currentVoice: {
    hash: string;
    inst: number;
    voff: number;
    ooff: number;
  }[] = [
    { hash: "", ...fallback_voice },
    { hash: "", ...fallback_voice },
    { hash: "", ...fallback_voice },
    { hash: "", ...fallback_voice },
    { hash: "", ...fallback_voice },
    { hash: "", ...fallback_voice }
  ];

  _div = 0;
  _regs = [new Uint8Array(256), new Uint8Array(256)];
  _buf = new VGMWriteDataCommandBuffer(256, 1);

  _keyFlags = [0, 0, 0, 0, 0, 0];

  _waveType: "saw" | "sqr" | "sin" | string;
  _autoVoiceMap: boolean;

  constructor(from: ChipInfo, to: ChipInfo, opts: { ws?: string; autoVoiceMap?: boolean }) {
    super(from, to);
    this._waveType = opts.ws || "saw";
    this._autoVoiceMap = opts.autoVoiceMap || true;
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const cmd = this.from.index ? 0xa1 : 0x51;
    const index = this.from.index;
    this._buf.push(new VGMWriteDataCommand({ cmd, index, port: 0, addr, data }), optimize);
  }

  _identifyVoice(ch: number) {
    const port = ch < 3 ? 0 : 1;
    const nch = ch < 3 ? ch : (ch + 1) & 3;
    const regs = this._regs[port];
    // prettier-ignore
    const rawVoice = [
      regs[0x30 + nch], regs[0x34 + nch], regs[0x38 + nch], regs[0x3c + nch],
      regs[0x40 + nch], regs[0x44 + nch], regs[0x48 + nch], regs[0x4c + nch],
      regs[0x50 + nch], regs[0x54 + nch], regs[0x58 + nch], regs[0x5c + nch],
      regs[0x60 + nch], regs[0x64 + nch], regs[0x68 + nch], regs[0x6c + nch],
      regs[0x70 + nch], regs[0x74 + nch], regs[0x78 + nch], regs[0x7c + nch],
      regs[0x80 + nch], regs[0x84 + nch], regs[0x88 + nch], regs[0x8c + nch],
      regs[0x90 + nch], regs[0x94 + nch], regs[0x98 + nch], regs[0x9c + nch],
      regs[0xb0 + nch], regs[0xb4 + nch]
    ];
    const nextHash = rawVoice.map(e => ("0" + e.toString(16)).slice(-2)).join("");
    const prevVoice = this._currentVoice[ch];
    if (nextHash != prevVoice.hash) {
      const isNew = this._voiceHashMap[nextHash] == null;
      // if (isNew) {
      //   console.log(`CH${ch},${nextHash}`);
      // }
      const opnVoice = toOPNVoice(rawVoice);
      this._voiceHashMap[nextHash] = opnVoice;
      const estimated_voice = this._autoVoiceMap
        ? estimateOPLLVoice(OPNVoiceToOPLVoice(opnVoice, true)[0])
        : { inst: 0, voff: 1, ooff: 0 };
      this._currentVoice[ch] = {
        hash: nextHash,
        ...(voiceMap[nextHash] || estimated_voice || fallback_voice)
      };
    }
  }

  _updateInstVol(port: number, nch: number) {
    const regs = this._regs[port];
    const ch = nch + port * 3;
    const alg = regs[0xb0 + nch] & 7;
    if (this._currentVoice[ch].hash == "") {
      this._identifyVoice(ch);
    }
    const { inst, voff } = this._currentVoice[ch];
    const amps = [regs[0x40 + nch] & 0x7f, regs[0x44 + nch] & 0x7f, regs[0x48 + nch] & 0x7f, regs[0x4c + nch] & 0x7f];
    let vol; // 7f * 4
    switch (alg) {
      case 4:
        vol = (amps[2] + amps[3]) / 2;
        break;
      case 5:
      case 6:
        vol = (amps[1] + amps[2] + amps[3]) / 3;
        break;
      case 7:
        vol = (amps[0] + amps[1] + amps[2] + amps[3]) / 4;
        break;
      default:
        vol = amps[3];
        break;
    }
    const vv = (vol >> 3) + voff;
    const d = (inst << 4) | Math.min(15, Math.max(0, vv));
    this._y(0x30 + ch, d);
  }

  _convertFM(cmd: VGMWriteDataCommand): VGMCommand[] {
    const adr = cmd.addr;
    const regs = this._regs[cmd.port];
    regs[adr] = cmd.data;
    if (cmd.port == 0) {
      if (adr === 0x28) {
        const nch = cmd.data & 3;
        if (nch !== 3) {
          const ch = nch + (cmd.data & 4 ? 3 : 0);
          const al = 0xa0 + nch;
          const ah = 0xa4 + nch;
          const fnum = (((regs[ah] & 7) << 8) | regs[al]) >> 2;
          const blk = (regs[ah] >> 3) & 7;
          // const key = 0;
          const key = cmd.data >> 4 != 0 ? 1 : 0;
          if (key != this._keyFlags[ch]) {
            if (key) {
              this._identifyVoice(ch);
              this._updateInstVol(cmd.port, nch);
            }
            this._keyFlags[ch] = key;
          }
          const dl = fnum & 0xff;
          const dh = (key << 4) | (blk << 1) | (fnum >> 8);
          this._y(0x20 + ch, dh);
          this._y(0x10 + ch, dl);
        }
      }
    }

    if (0x40 <= adr && adr <= 0x4f) {
      const nch = adr & 3;
      if (nch !== 3) {
        this._updateInstVol(cmd.port, nch);
      }
    }

    if ((0xa0 <= adr && adr <= 0xa2) || (0xa4 <= adr && adr < 0xa6)) {
      const nch = adr & 3;
      const ch = nch + cmd.port * 3;
      const al = 0xa0 + nch;
      const ah = 0xa4 + nch;
      const fnum = (((regs[ah] & 7) << 8) | regs[al]) >> 2;
      const blk = (regs[ah] >> 3) & 7;
      const key = this._keyFlags[ch];
      const dl = fnum & 0xff;
      const dh = (key << 4) | (blk << 1) | (fnum >> 8);
      this._y(0x20 + ch, dh);
      this._y(0x10 + ch, dl);
    }

    return this._buf.commit();
  }

  getInitialCommands(): Array<VGMCommand> {
    // select FM 6-ch mode
    this._y(14, 32);
    switch (this._waveType) {
      case "sin":
        this._y(0, 0x21);
        this._y(1, 0x21);
        this._y(2, 0x3f);
        this._y(3, 0x00);
        this._y(4, 0x00);
        this._y(5, 0xf8);
        this._y(6, 0x07);
        this._y(7, 0x17);
        break;
      case "sqr":
        this._y(0, 0x22);
        this._y(1, 0x21);
        this._y(2, 0x1d);
        this._y(3, 0x07);
        this._y(4, 0xf0);
        this._y(5, 0xf8);
        this._y(6, 0x07);
        this._y(7, 0x17);
        break;
      case "saw":
      default:
        this._y(0, 0x21);
        this._y(1, 0x21);
        this._y(2, 0x1d);
        this._y(3, 0x07);
        this._y(4, 0xf0);
        this._y(5, 0xf8);
        this._y(6, 0x07);
        this._y(7, 0x17);
        break;
    }
    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertSSG = this.from.subModule == null || this.from.subModule === "ssg";
    const convertFM = this.from.subModule == null || this.from.subModule === "fm";

    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.from.chip && cmd.index === this.from.index) {
      if (cmd.addr < 0x10 && cmd.port === 0) {
        if (convertSSG) {
          // return this._convertSSG(cmd);
          return [];
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

export class YM2203ToYM2413Converter extends OPNToYM2413Converter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ym2413", index: from.index, clock: 1, relativeClock: true }, opts);
  }
}

export class YM2608ToYM2413Converter extends OPNToYM2413Converter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ym2413", index: from.index, clock: 1 / 2, relativeClock: true }, opts);
  }
}
