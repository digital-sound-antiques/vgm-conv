import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { OPNVoice } from "ym-voice";

const fallback_voice = { program: 1, volumeOffset: 0, octaveOffset: 0 };

const user_voice_map: { [key: number]: number[] } = {
  0: [0x01, 0x01, 0x1c, 0x07, 0xf0, 0xd7, 0x00, 0x11], // default
  // original tone can be defined from @16
  16: [0x22, 0x21, 0x04, 0x07, 0xdb, 0xf6, 0xab, 0xf6], // TOM
  17: [0x2f, 0x2f, 0x00, 0x07, 0xf0, 0xc5, 0x00, 0xf5], // CYM
  18: [0x2f, 0x2f, 0x00, 0x07, 0xf0, 0xf7, 0x00, 0xf7], // HH
  19: [0x2f, 0x2f, 0x0d, 0x00, 0xf0, 0xfc, 0x00, 0x25], // RIM
  20: [0x2f, 0x20, 0x04, 0x07, 0xf0, 0xf7, 0x00, 0xf7], // SD
  21: [0x0f, 0x07, 0x00, 0x05, 0xfe, 0xfd, 0x00, 0x3a], // HH
  22: [0x0f, 0x02, 0x00, 0x07, 0xf0, 0xfc, 0x00, 0x37], // SD
  23: [0x02, 0x10, 0x00, 0x00, 0xfc, 0xc7, 0x80, 0x25], // BS
  24: [0x0f, 0x10, 0x0f, 0x00, 0xfc, 0x79, 0xff, 0x47], // RIM 
  25: [0x02, 0x01, 0x12, 0x00, 0xfe, 0xb6, 0xf0, 0x25], // BD (Galact)
}

/** instrument data to voice and volue offset (attenuation) */
const voiceMap: { [key: string]: { program: number; volumeOffset: number; octaveOffset: number } } = {
};

function _estimateOPLLVoice(opn: OPNVoice): { program: number, volumeOffset: number, octaveOffset: number } | undefined {
  const voice = voiceMap[opn.toHash()];
  if (voice != null) {
    return voice;
  }
  return opn.toOPL()[0].toOPLLROMVoice();
}

function _calcMainTotalLevel(data: number[]): number {
  const alg = data[28] & 7;
  let min = 0;
  switch (alg) {
    case 0:
    case 1:
    case 2:
    case 3:
      return data[7];
    case 4:
      min = Math.min(data[6], data[7]);
      return min;
    case 5:
    case 6:
      min = Math.min(data[5], data[6], data[7]);
      return min;
    default:
      min = Math.min(data[5], data[6], data[7], data[8]);
      return min;
  }
}

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

export abstract class OPNToYM2413Converter extends VGMConverter {
  _voiceHashMap: { [key: string]: OPNVoice } = {};
  _currentVoice: {
    hash: string;
    program: number;
    volumeOffset: number;
    octaveOffset: number;
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
  _blkFnums = [0, 0, 0, 0, 0, 0];

  constructor(from: ChipInfo, to: ChipInfo, public opts: any) {
    super(from, to);
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
      (regs[0xb0 + nch] & 0x3f), (regs[0xb4 + nch] & 0x37)
    ];
    const nextHash = rawVoice.map(e => ("0" + e.toString(16)).slice(-2)).join("");
    const prevVoice = this._currentVoice[ch];
    if (nextHash != prevVoice.hash) {
      const isNew = this._voiceHashMap[nextHash] == null;
      const opnVoice = OPNVoice.decode(rawVoice);
      this._voiceHashMap[nextHash] = opnVoice;
      const estimated_voice = _estimateOPLLVoice(opnVoice);
      const voice = (voiceMap[nextHash] || estimated_voice || fallback_voice);
      if (isNew) {
        console.error(`"${nextHash}":{program:${voice.program},volumeOffset:${voice.volumeOffset},octaveOffset:${voice.octaveOffset}}, // CH${ch}`);
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
    const { program, volumeOffset } = this._currentVoice[ch];
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
    const vv = (vol >> 3) + volumeOffset;
    if (0 < program && program < 16) {
      const d = (program << 4) | Math.min(15, Math.max(0, vv));
      this._y(0x30 + ch, d);
    } else {
      const v = user_voice_map[program] || user_voice_map[0];
      for (let i = 0; i < v.length; i++) {
        this._y(i, v[i]);
      }
      const d = Math.min(15, Math.max(0, vv));
      this._y(0x30 + ch, d);

    }
  }

  convertFM(cmd: VGMWriteDataCommand): VGMCommand[] {
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
          const { octaveOffset } = this._currentVoice[ch];
          const blk_o = Math.min(7, Math.max(0, octaveOffset + blk));
          const dl = fnum & 0xff;
          const dh = (key << 4) | (blk_o << 1) | (fnum >> 8);
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
      const { octaveOffset } = this._currentVoice[ch];
      const blk = ((regs[ah] >> 3) & 7);
      const blk_o = Math.min(7, Math.max(0, octaveOffset + blk));
      const key = this._keyFlags[ch];
      const dl = fnum & 0xff;
      const dh = (key << 4) | (blk_o << 1) | (fnum >> 8);

      if (0xa0 <= adr && adr <= 0xa2) {
        this._blkFnums[ch] = (blk << 9) | fnum;
        this._y(0x20 + ch, dh);
        this._y(0x10 + ch, dl);
      }
    }

    return this._buf.commit();
  }

  getInitialCommands(): Array<VGMCommand> {
    // select FM 6-ch mode
    this._y(14, 32);
    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertSSG = this.from.subModule == null || this.from.subModule === "ssg";
    const convertFM = this.from.subModule == null || this.from.subModule === "fm";

    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this.from.chip && cmd.index === this.from.index) {
      if (cmd.addr < 0x10 && cmd.port === 0) {
        if (convertSSG) {
          // Not Supported
          return [];
        }
      } else {
        if (convertFM) {
          return this.convertFM(cmd);
        }
      }
    }
    return [cmd];
  }
}
