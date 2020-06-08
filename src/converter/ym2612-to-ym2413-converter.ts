import { VGMConverter, ChipInfo } from "./vgm-converter";
import {
  VGMCommand,
  VGMWriteDataCommand,
  VGMWaitWordCommand,
  VGMWaitNibbleCommand,
  VGMWrite2ACommand,
  VGMSeekPCMCommand,
  VGMDataBlockCommand
} from "vgm-parser";
import { YM2413DACTable } from "./ym2413-dac-table";
import { toOPNVoice, OPNVoice } from "./opn-voices";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { OPNVoiceToOPLVoice, estimateOPLLVoice } from "./voice-converter";

const fallback_voice = { inst: 1, voff: 0, ooff: 0 };

const user_voice_map: { [key: number]: number[] } = {
  0: [0x01, 0x01, 0x1c, 0x07, 0xf0, 0xd7, 0x00, 0x11], // default
  // original tone can be defined from @16
  16: [0x22, 0x21, 0x04, 0x07, 0xdb, 0xf6, 0xab, 0xf6], // TOM
  17: [0x2f, 0x2f, 0x00, 0x07, 0xf0, 0xc5, 0x00, 0xf5], // CYM
  18: [0x2f, 0x2f, 0x00, 0x07, 0xf0, 0xf7, 0x00, 0xf7], // HH
  19: [0x2f, 0x2f, 0x0d, 0x00, 0xf0, 0xfc, 0x00, 0x25], // RIM
  20: [0x2f, 0x20, 0x04, 0x07, 0xf0, 0xf7, 0x00, 0xf7], // SD
}

/** instrument data to voice and volue offset (attenuation) */
const voiceMap: { [key: string]: { inst: number; voff: number; ooff: number } } = {
  "007f0b0f000000001f199f9f161c879f408580c51034f576000000003400": { inst: 17, voff: 0, ooff: 0 },
  "64233201070000001f1b1c135b5f5750020008000ffcfafb000000003600": { inst: 16, voff: -15, ooff: 0 },
  "3000090127052500161f171f191c1f001f001f000f500ffc000000000300": { inst: 14, voff: 1, ooff: -1 },
  "0e0f080b0d0004001f1f1f1f121f1513c0804001000f4797000000003c00": { inst: 18, voff: 0, ooff: 0 },
  "0e0f080b000000001f1f1f1f121f1415c0805f1f000fffff000000003c00": { inst: 18, voff: 0, ooff: 0 },
  "0e0f080b0d0000001f1f1f1f001f1716c0805f1f000fffff000000003c00": { inst: 18, voff: 0, ooff: 0 },
  "0f720f0d04007600131f8f951f1f8c93408080c210a2f486000000003c07": { inst: 19, voff: -1, ooff: 0 },
  "313133710d150000181f1f1f8f191a00811c00001fff0f0f000000003c00": { inst: 1, voff: -2, ooff: 0 },
  "6f213f00000000001f1b1f1f415553540200080000fcfbfc000000003e00": { inst: 20, voff: 0, ooff: 0 },
};

function _normalizeTotalLevel(data: number[]): number[] {
  const alg = data[28] & 7;
  let min = 0;
  switch (alg) {
    case 0:
    case 1:
    case 2:
    case 3:
      data[7] = 0;
      break;
    case 4:
      min = Math.min(data[6], data[7]);
      data[6] -= min;
      data[7] -= min;
      break;
    case 5:
    case 6:
      min = Math.min(data[5], data[6], data[7]);
      data[5] -= min;
      data[6] -= min;
      data[7] -= min;
      break;
    case 7:
      min = Math.min(data[5], data[6], data[7], data[8]);
      data[5] -= min;
      data[6] -= min;
      data[7] -= min;
      data[8] -= min;
      break;
  }
  return data;

}

export class YM2612ToYM2413Converter extends VGMConverter {
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

  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _regs = [new Uint8Array(256), new Uint8Array(256)];
  _keyFlags = [0, 0, 0, 0, 0, 0];
  _blkFnums = [0, 0, 0, 0, 0, 0];
  _goalClock: number;
  _useTestMode: boolean;
  _rootCH = 0;
  _decimation: number;
  _autoVoiceMap: boolean;

  constructor(
    from: ChipInfo,
    to: ChipInfo,
    opts: { autoVoiceMap?: boolean; useTestMode?: boolean; decimation?: number }
  ) {
    super(from, { chip: "ym2413", index: from.index, clock: 1 / 2, relativeClock: true });
    this._goalClock = to.clock || 3579545;
    this._useTestMode = opts.useTestMode || false;
    this._decimation = opts.decimation || 4;
    this._autoVoiceMap = opts.autoVoiceMap == null ? true : opts.autoVoiceMap;
  }

  _y(addr: number, data: number, optimize: boolean = true) {
    const cmd = this.from.index ? 0xa1 : 0x51;
    const index = this.from.index;
    return this._buf.push(new VGMWriteDataCommand({ cmd, index, port: 0, addr, data }), optimize);
  }

  _identifyVoice(ch: number) {
    const port = ch < 3 ? 0 : 1;
    const nch = ch < 3 ? ch : (ch + 1) & 3;
    const regs = this._regs[port];
    // prettier-ignore
    const rawVoice = _normalizeTotalLevel([
      regs[0x30 + nch], regs[0x34 + nch], regs[0x38 + nch], regs[0x3c + nch],
      regs[0x40 + nch], regs[0x44 + nch], regs[0x48 + nch], regs[0x4c + nch],
      regs[0x50 + nch], regs[0x54 + nch], regs[0x58 + nch], regs[0x5c + nch],
      regs[0x60 + nch], regs[0x64 + nch], regs[0x68 + nch], regs[0x6c + nch],
      regs[0x70 + nch], regs[0x74 + nch], regs[0x78 + nch], regs[0x7c + nch],
      regs[0x80 + nch], regs[0x84 + nch], regs[0x88 + nch], regs[0x8c + nch],
      regs[0x90 + nch], regs[0x94 + nch], regs[0x98 + nch], regs[0x9c + nch],
      (regs[0xb0 + nch] & 0x3f), (regs[0xb4 + nch] & 0x37)
    ]);

    const nextHash = rawVoice.map(e => ("0" + e.toString(16)).slice(-2)).join("");
    const prevVoice = this._currentVoice[ch];
    if (nextHash != prevVoice.hash) {
      const isNew = this._voiceHashMap[nextHash] == null;
      const opnVoice = toOPNVoice(rawVoice);
      this._voiceHashMap[nextHash] = opnVoice;
      const estimated_voice = this._autoVoiceMap
        ? estimateOPLLVoice(OPNVoiceToOPLVoice(opnVoice, true)[0])
        : { inst: 1, voff: -1, ooff: 0 };
      const voice = (voiceMap[nextHash] || estimated_voice || fallback_voice);
      if (isNew) {
        console.log(`"${nextHash}":{inst:${voice.inst},voff:${voice.voff},ooff:${voice.ooff}}, // CH${ch}`);
      }
      this._currentVoice[ch] = {
        hash: nextHash,
        ...voice,
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
    if (0 < inst && inst < 16) {
      const d = (inst << 4) | Math.min(15, Math.max(0, vv));
      this._y(0x30 + ch, d);
    } else {
      const v = user_voice_map[inst] || user_voice_map[0];
      for (let i = 0; i < v.length; i++) {
        this._y(i, v[i]);
      }
      const d = Math.min(15, Math.max(0, vv));
      this._y(0x30 + ch, d);

    }
  }

  getInitialCommands(): Array<VGMCommand> {
    // select FM 9-ch mode
    this._y(14, 0);

    if (this._useTestMode) {
      this._y(15, 4);

      // SAW
      this._y(1, 0x2c);
      this._y(0, 0x2c);
      this._y(2, 0x28);
      this._y(3, 0x07);
      this._y(4, 0xf0);
      this._y(5, 0xf0);
      this._y(6, 0x0f);
      this._y(7, 0x0f);

      this._rootCH = 6;

      this._y(48 + this._rootCH, 0, false);
      this._y(49 + this._rootCH, 0, false);
      this._y(50 + this._rootCH, 0, false);

      this._y(32 + this._rootCH, 0x1e, false);
      this._y(33 + this._rootCH, 0x1e, false);
      this._y(34 + this._rootCH, 0x1e, false);
    } else {
      // make sure all channels key-off
      this._y(37, 0, false);
      this._y(38, 0, false);
      this._y(39, 0, false);
      this._y(40, 0, false);

      // select violin tone whose modulator AR is 15.
      this._y(53, (1 << 4) | 15, false);
      this._y(54, (1 << 4) | 15, false);
      this._y(55, (1 << 4) | 15, false);
      this._y(56, (1 << 4) | 15, false);

      // set f-number fnum=1 is the most accurate but need longer wait time.
      const fnum = 32;
      this._y(21, fnum, false);
      this._y(22, fnum, false);
      this._y(23, fnum, false);
      this._y(24, fnum, false);

      // start phase generator
      this._y(37, 16, false);
      this._y(38, 16, false);
      this._y(39, 16, false);
      this._y(40, 16, false);

      // wait until 1/4 cycle of phase generator
      const freq = (fnum * this._goalClock) / 72 / (1 << 19);
      const cycleInSeconds = 1.0 / freq;
      const nnnn = Math.round(44100 * (cycleInSeconds / 4));
      this._buf.push(new VGMWaitWordCommand({ count: nnnn }), false);

      // stop phase generator
      this._y(21, 0, false);
      this._y(22, 0, false);
      this._y(23, 0, false);
      this._y(24, 0, false);

      // user-voice
      for (let i = 0; i < 8; i++) this._y(i, user_voice_map[0][i], false);
    }
    return this._buf.commit();
  }

  _pcmData = new Uint8Array();
  _pcmIndex = 0;

  _convert2A(cmd: VGMWrite2ACommand): VGMCommand[] {
    const v = this._pcmData[this._pcmIndex];
    this._pcmIndex++;

    if (this._decimation <= 1 || this._div % this._decimation !== 0) {
      if (this._useTestMode) {
        const vv = 47 + Math.round((208 * v) / 255);
        this._y(16 + this._rootCH, vv, false);
        this._y(17 + this._rootCH, vv, false);
        this._y(18 + this._rootCH, vv, false);
      } else {
        const idx = Math.min(768, v * 4) & 0x3f8;
        const vs = YM2413DACTable[idx];
        for (let i = 0; i < 3; i++) {
          this._y(56 - i, (8 << 4) | vs[2 - i], false);
        }
      }
    }
    if (1 <= cmd.count) {
      this._buf.push(new VGMWaitNibbleCommand({ count: cmd.count }));
    }
    this._div++;
    return this._buf.commit();
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
          const blk = this._blkFnums[ch] >> 9;
          const fnum = this._blkFnums[ch] & 0x1ff;
          const key = (cmd.data >> 4) != 0 ? 1 : 0;
          if (key != this._keyFlags[ch]) {
            if (key) {
              this._identifyVoice(ch);
              this._updateInstVol(cmd.port, nch);
            }
            this._keyFlags[ch] = key;
          }
          const dh = (key << 4) | (blk << 1) | (fnum >> 8);
          this._y(0x20 + ch, dh, false);
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
      const { ooff } = this._currentVoice[ch];
      const blk = Math.min(7, Math.max(0, ooff + ((regs[ah] >> 3) & 7)));
      const key = this._keyFlags[ch];
      const dl = fnum & 0xff;
      const dh = (key << 4) | (blk << 1) | (fnum >> 8);

      if (0xa0 <= adr && adr <= 0xa2) {
        this._blkFnums[ch] = (blk << 9) | fnum;
        this._y(0x20 + ch, dh);
        this._y(0x10 + ch, dl);
      }
    }

    return this._buf.commit();
  }

  _convertSeekPCM(cmd: VGMSeekPCMCommand): Array<VGMCommand> {
    this._pcmIndex = cmd.offset;
    return [];
  }

  _convertDataBlock(cmd: VGMDataBlockCommand): Array<VGMCommand> {
    if (cmd.chip === "ym2612") {
      this._pcmData = cmd.blockData;
      return [];
    }
    return [cmd];
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertFM = this.from.subModule == null || this.from.subModule === "fm";
    const convertDAC = this.from.subModule == null || this.from.subModule === "dac";

    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "ym2612" && cmd.index === this.from.index) {
      if (convertFM) {
        if (this.from.subModule == "fm" && cmd.addr == 0x2b) {
          return [cmd];
        }
        if (!this._useTestMode) {
          return this._convertFM(cmd);
        }
        return [];
      }
    }
    if (cmd instanceof VGMDataBlockCommand && cmd.chip === "ym2612") {
      if (convertDAC) {
        return this._convertDataBlock(cmd);
      }
    }
    if (cmd instanceof VGMWrite2ACommand) {
      if (convertDAC) {
        return this._convert2A(cmd);
      }
    }
    if (cmd instanceof VGMSeekPCMCommand) {
      if (convertDAC) {
        return this._convertSeekPCM(cmd);
      }
    }
    return [cmd];
  }
}
