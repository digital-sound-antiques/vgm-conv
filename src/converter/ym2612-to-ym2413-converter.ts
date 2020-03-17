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
import { OPNVoiceToOPLVoice } from "./voice-converter";
import { OPLL_VOICES as ROM_VOICES, toOPLLVoice } from "./opll-voices";
import { OPLVoice } from "./opl-voices";

const fallback_voice = { inst: 0, voff: 0, ooff: 0 };

const user_voice = [0x01, 0x01, 0x1c, 0x07, 0xf0, 0xd7, 0x00, 0x11];
const opll_voices = [toOPLLVoice(user_voice), ...ROM_VOICES.slice(1)];
const ml_tbl = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15];

function estimateOPLLVoice(opl: OPLVoice): { inst: number; voff: number; ooff: number } {
  let diff = Infinity;
  let inst = 0;
  for (let i = 0; i < opll_voices.length; i++) {
    const opll = opll_voices[i];
    if (i == 13) continue;
    let d = 0;
    const ml_a = opl.slots[1].ml / ml_tbl[opl.slots[0].ml];
    const ml_b = opll.slots[1].ml / ml_tbl[opll.slots[0].ml];
    d += Math.abs(ml_a - ml_b) << 1;
    d += Math.abs(opl.fb - opll.fb) >> 1;
    d += Math.abs(opl.slots[0].ar - opll.slots[0].ar);
    d += Math.abs(opl.slots[1].ar - opll.slots[1].ar);
    d += Math.abs(opl.slots[0].dr - opll.slots[0].dr);
    d += Math.abs(opl.slots[1].dr - opll.slots[1].dr);
    d +=
      Math.min(
        63,
        4 * Math.abs(opl.slots[0].sl - opll.slots[0].sl) +
          Math.abs(opl.slots[0].tl - (opll.slots[0].tl + opll.slots[0].ws ? 8 : 0))
      ) >> 3;
    if (opl.slots[1].rr === 0) {
      // sustainable tone
      if (opll.slots[1].eg === 0) {
        continue;
      }
      d += Math.abs(opl.slots[1].sl - opll.slots[1].sl);
    } else {
      // percusive tone
      if (opll.slots[1].eg === 1) {
        continue;
      }
      d += Math.abs(opl.slots[1].rr - opll.slots[1].rr);
    }
    if (d < diff) {
      inst = i;
      diff = d;
    }
  }
  const opll = opll_voices[inst];
  const ooff = Math.floor(Math.log2(ml_tbl[opl.slots[1].ml] / ml_tbl[opll.slots[1].ml]) / 2);
  let voff = 1;
  if (opll.slots[1].ws) {
    voff -= 2;
    if (opll.slots[0].ws) {
      voff -= 2;
    }
  }
  return { inst, voff, ooff };
}

/** instrument data to voice and volue offset (attenuation) */
const voiceMap: { [key: string]: { inst: number; voff: number; ooff: number } } = {
  "3f3030311a00000000000000000000000000000000000000000000000000": { inst: 2, voff: 15, ooff: 0 },
  "015121011e00000000000000000000000000000000000000000000000000": { inst: 2, voff: 15, ooff: 0 },
  "43174f710500000000000000000000000000000000000000000000000000": { inst: 2, voff: 15, ooff: 0 },
  "040204012100000000000000000000000000000000000000000000000000": { inst: 10, voff: 1, ooff: 0 },
  "0f0000000700000000000000000000000000000000000000000000000000": { inst: 0, voff: 15, ooff: 0 },
  "0c015c53281e3c151f1f9f9f02020c0f07070707ff3f3f3f000000003980": { inst: 11, voff: 1, ooff: 0 },
  "0c015c53281e3c151f1f9f9f02020c0f07070707ff3f3f3f000000003940": { inst: 11, voff: 1, ooff: 0 },
  "75757575001212171e1e1e1e141414141f1f1f1f5f5f5f5f000000003a80": { inst: 0, voff: 15, ooff: 0 }, // PCM
  "3f3030311a1a350fdf9fdf9f0e0c0a0709000900271717070000000028c0": { inst: 15, voff: 1, ooff: -1 },
  "0111011107150f14121212121a1a0c0c0000000028283838000000003cc0": { inst: 10, voff: 1, ooff: 0 },
  "04020401212121211f1f1f1f000000000000000007070707000000003ec0": { inst: 10, voff: 1, ooff: 0 }
};

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
      for (let i = 0; i < 8; i++) this._y(i, user_voice[i], false);
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
          this._y(56 - i, (8 << 4) | vs[i], false);
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
          const al = 0xa0 + nch;
          const ah = 0xa4 + nch;
          const fnum = (((regs[ah] & 7) << 8) | regs[al]) >> 2;
          const { ooff } = this._currentVoice[ch];
          const blk = Math.min(7, Math.max(0, ooff + ((regs[ah] >> 3) & 7)));
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
          this._y(0x20 + ch, dh, false);
          this._y(0x10 + ch, dl, false);
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
      this._y(0x20 + ch, dh);
      this._y(0x10 + ch, dl);
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
