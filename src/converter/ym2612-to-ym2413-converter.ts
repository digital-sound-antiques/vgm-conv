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

const voices = [
  { inst: 0, voff: 0 },
  { inst: 0, voff: 0 },
  { inst: 0, voff: 0 },
  { inst: 0, voff: 0 },
  { inst: 0, voff: 0 },
  { inst: 0, voff: 0 }
];

/** instrument data to voice and volue offset (attenuation) */
const voiceMap: { [key: string]: { inst: number; voff: number } } = {};

export class YM2612ToYM2413Converter extends VGMConverter {
  _voiceHashMap: { [key: string]: OPNVoice } = {};
  _currentVoice: {
    hash: string;
    inst: number;
    voff: number;
  }[] = [];

  _div = 0;
  _regs = [new Uint8Array(256), new Uint8Array(256)];
  _outRegs = new Int16Array(256);
  _keyFlags = [0, 0, 0, 0, 0, 0];
  _goalClock: number;
  _useTestMode: boolean;
  _rootCH = 0;
  _decimation: number;

  constructor(from: ChipInfo, to: ChipInfo, opts: { useTestMode?: boolean; decimation?: number }) {
    super(from, { chip: "ym2413", index: from.index, clock: 1 / 2, relativeClock: true });
    this._goalClock = to.clock || 3579545;
    this._outRegs.fill(-1);
    this._useTestMode = opts.useTestMode || false;
    this._decimation = opts.decimation || 4;
  }

  _y(addr: number, data: number): VGMCommand {
    const cmd = this.from.index ? 0xa1 : 0x51;
    const index = this.from.index;
    return new VGMWriteDataCommand({ cmd, index, port: 0, addr, data });
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
    if (prevVoice == null || nextHash != prevVoice.hash) {
      const isNew = this._voiceHashMap[nextHash] == null;
      // if (isNew) {
      //   console.log(`CH${ch},${nextHash}`);
      // }
      const opnVoice = toOPNVoice(rawVoice);
      this._voiceHashMap[nextHash] = opnVoice;
      this._currentVoice[ch] = {
        hash: nextHash,
        ...(voiceMap[nextHash] || voices[ch])
      };
    }
  }

  _updateInstVol(result: Array<VGMCommand>, port: number, nch: number) {
    const regs = this._regs[port];
    const ch = nch + port * 3;
    const alg = regs[0xb0 + nch] & 7;
    if (this._currentVoice[ch] == null) {
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
    if (this._outRegs[0x30 + ch] != d) {
      result.push(this._y(0x30 + ch, d));
      this._outRegs[0x30 + ch] = d;
    }
  }

  getInitialCommands(): Array<VGMCommand> {
    let res: Array<VGMCommand> = [];

    // select FM 9-ch mode
    res.push(this._y(14, 0));

    if (this._useTestMode) {
      res.push(this._y(15, 4));

      // SAW
      res.push(this._y(0, 0x2c));
      res.push(this._y(1, 0x2c));
      res.push(this._y(2, 0x28));
      res.push(this._y(3, 0x07));
      res.push(this._y(4, 0xf0));
      res.push(this._y(5, 0xf0));
      res.push(this._y(6, 0x0f));
      res.push(this._y(7, 0x0f));

      this._rootCH = 6;

      res.push(this._y(48 + this._rootCH, 0));
      res.push(this._y(49 + this._rootCH, 0));
      res.push(this._y(50 + this._rootCH, 0));

      res.push(this._y(32 + this._rootCH, 0x1e));
      res.push(this._y(33 + this._rootCH, 0x1e));
      res.push(this._y(34 + this._rootCH, 0x1e));
    } else {
      // make sure all channels key-off
      res.push(this._y(37, 0));
      res.push(this._y(38, 0));
      res.push(this._y(39, 0));
      res.push(this._y(40, 0));

      // select violin tone whose modulator AR is 15.
      res.push(this._y(53, (1 << 4) | 15));
      res.push(this._y(54, (1 << 4) | 15));
      res.push(this._y(55, (1 << 4) | 15));
      res.push(this._y(56, (1 << 4) | 15));

      // set f-number fnum=1 is the most accurate but need longer wait time.
      const fnum = 32;
      res.push(this._y(21, fnum));
      res.push(this._y(22, fnum));
      res.push(this._y(23, fnum));
      res.push(this._y(24, fnum));

      // start phase generator
      res.push(this._y(37, 16));
      res.push(this._y(38, 16));
      res.push(this._y(39, 16));
      res.push(this._y(40, 16));

      // wait until 1/4 cycle of phase generator
      const freq = (fnum * this._goalClock) / 72 / (1 << 19);
      const cycleInSeconds = 1.0 / freq;
      const nnnn = Math.round(44100 * (cycleInSeconds / 4));
      res.push(new VGMWaitWordCommand({ count: nnnn }));

      // stop phase generator
      res.push(this._y(21, 0));
      res.push(this._y(22, 0));
      res.push(this._y(23, 0));
      res.push(this._y(24, 0));

      res.push(this._y(0, 0x21));
      res.push(this._y(1, 0x01));
      res.push(this._y(2, 0x1d));
      res.push(this._y(3, 0x07));
      res.push(this._y(4, 0xf0));
      res.push(this._y(5, 0xf4));
      res.push(this._y(6, 0x00));
      res.push(this._y(7, 0x22));
    }
    return res;
  }

  _pcmData = new Uint8Array();
  _pcmIndex = 0;

  _convert2A(cmd: VGMWrite2ACommand): VGMCommand[] {
    const res = Array<VGMCommand>();
    const v = this._pcmData[this._pcmIndex];
    this._pcmIndex++;

    if (this._decimation <= 1 || this._div % this._decimation !== 0) {
      if (this._useTestMode) {
        const vv = 47 + Math.round((208 * v) / 255);
        res.push(this._y(16 + this._rootCH, vv));
        res.push(this._y(17 + this._rootCH, vv));
        res.push(this._y(18 + this._rootCH, vv));
      } else {
        const idx = Math.min(768, v * 4) & 0x3f8;
        const vs = YM2413DACTable[idx];
        for (let i = 0; i < 3; i++) {
          res.push(this._y(56 - i, (8 << 4) | vs[i]));
        }
      }
    }
    if (1 <= cmd.count) {
      res.push(new VGMWaitNibbleCommand({ count: cmd.count }));
    }
    this._div++;
    return res;
  }

  _convertFM(cmd: VGMWriteDataCommand): VGMCommand[] {
    let result = Array<VGMCommand>();
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
              this._updateInstVol(result, cmd.port, nch);
            }
            this._keyFlags[ch] = key;
          }
          const dl = fnum & 0xff;
          const dh = (key << 4) | (blk << 1) | (fnum >> 8);
          if (this._outRegs[0x20 + ch] != dh) {
            result.push(this._y(0x20 + ch, dh));
            this._outRegs[0x20 + ch] = dh;
          }
          if (this._outRegs[0x10 + ch] != dl) {
            result.push(this._y(0x10 + ch, dl));
            this._outRegs[0x10 + ch] = dl;
          }
        }
      }
    }

    if (0x40 <= adr && adr <= 0x4f) {
      const nch = adr & 3;
      if (nch !== 3) {
        this._updateInstVol(result, cmd.port, nch);
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
      if (this._outRegs[0x20 + ch] != dh) {
        result.push(this._y(0x20 + ch, dh));
        this._outRegs[0x20 + ch] = dh;
      }
      if (this._outRegs[0x10 + ch] != dl) {
        result.push(this._y(0x10 + ch, dl));
        this._outRegs[0x10 + ch] = dl;
      }
    }

    return result;
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
