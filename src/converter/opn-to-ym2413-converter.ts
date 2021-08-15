import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { OPNVoice } from "ym-voice";

type VoiceMapEntry = {
  i: number;
  v?: number;
  o?: number;
};

type VoiceDefinition = {
  program: number;
  volumeOffset: number;
  octaveOffset: number;
};

const fallback_voice: VoiceDefinition = { program: 1, volumeOffset: 15, octaveOffset: 0 };

const MAX_VOICES = 1024;

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

function _programString(program: number) {
  if (program < MAX_VOICES) {
    return program.toString();
  }
  const res = [];
  if (program & (1<<10)) {
    res.push('HH');
  }
  if (program & (1<<11)) {
    res.push('CYM');
  }
  if (program & (1<<12)) {
    res.push('TOM');
  }
  if (program & (1<<13)) {
    res.push('SD');
  }
  if (program & (1<<14)) {
    res.push('BD');
  }
  return res.join('|');
}

function _volumeMapEntryString(voice: VoiceDefinition) {
  const res = [`i:${_programString(voice.program)}`];
  if (voice.volumeOffset != 0) {
    res.push(`v:${voice.volumeOffset}`);
  }
  if (voice.octaveOffset != 0) {
    res.push(`o:${voice.octaveOffset}`);
  }
  return `{${res.join(',')}}`;
}

export abstract class OPNToYM2413Converter extends VGMConverter {

  _userVoices: { [key: number]: number[] } = {
    0: [0x01, 0x01, 0x1c, 0x07, 0xf0, 0xd7, 0x00, 0x11],
  }
  /** instrument data to voice and volue offset (attenuation) */
  _voiceMap: { [key: string]: VoiceMapEntry } = {
    "000000000000000000000000000000000000000000000000000000000000": { i: 1, v: -15, o: 0 },
  };
  _autoMap = true;
  _voiceHashMap: { [key: string]: OPNVoice } = {};
  _currentVoice: (VoiceDefinition & { hash: string })[] = [
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
  _rkeyFlags = [0, 0, 0, 0, 0, 0];
  _rVolumes = { hh: 15, cym: 15, tom: 15, sd: 15, bd: 15 };

  constructor(from: ChipInfo, to: ChipInfo, public opts: any) {
    super(from, to);
    if (this.opts.voiceTable && this.opts.voiceTable.opn2opll) {
      const { opn2opll } = this.opts.voiceTable;
      this._userVoices = { ...this._userVoices, ...opn2opll.voices };
      this._voiceMap = { ...this._voiceMap, ...opn2opll.mapping };
      this._autoMap = opn2opll.autoMap != null ? opn2opll.autoMap : this._autoMap;
    }
  }

  _estimateOPLLVoice(opn: OPNVoice): VoiceDefinition {
    return opn.toOPL()[0].toOPLLROMVoice();
  }

  _getOPLLVoiceFromMap(hash: string): VoiceDefinition | null {
    const e = this._voiceMap[hash];
    if (e) {
      return {
        program: e.i,
        volumeOffset: -(e.v || 0),
        octaveOffset: e.o || 0,
      };
    }
    return null;
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
      const voice = this._getOPLLVoiceFromMap(nextHash) || (this._autoMap ? this._estimateOPLLVoice(opnVoice) : fallback_voice);
      if (isNew) {
        console.error(`"${nextHash}":${_volumeMapEntryString(voice)}, // CH${ch}`);
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
    } else if (program < MAX_VOICES) {
      const v = this._userVoices[program] || this._userVoices[0];
      for (let i = 0; i < v.length; i++) {
        this._y(i, v[i]);
      }
      const d = Math.min(15, Math.max(0, vv));
      this._y(0x30 + ch, d);
    } else {
      const d = Math.min(15, Math.max(0, vv));
      switch (program >> 10) {
        case 1: // HH
          this._rVolumes.hh = d;
          this._y(0x37, (this._rVolumes.hh << 4) | this._rVolumes.sd);
          break;
        case 2: // CYM
          this._rVolumes.cym = d;
          this._y(0x38, (this._rVolumes.tom << 4) | this._rVolumes.cym);
          break;
        case 4: // TOM
          this._rVolumes.tom = d;
          this._y(0x38, (this._rVolumes.tom << 4) | this._rVolumes.cym);
          break;
        case 8: // SD
          this._rVolumes.sd = d;
          this._y(0x37, (this._rVolumes.hh << 4) | this._rVolumes.sd);
          break;
        case 16: // BD
          this._rVolumes.bd = d;
          this._y(0x36, this._rVolumes.bd);
          break;
      }
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
          const key = (cmd.data >> 4) != 0 ? 1 : 0;
          if (key != this._keyFlags[ch]) {
            if (key) {
              this._identifyVoice(ch);
              this._updateInstVol(cmd.port, nch);
            }
          }
          const { program, octaveOffset } = this._currentVoice[ch];

          if (program >= MAX_VOICES) {
            if (key) {
              this._rkeyFlags[ch] = (program >> 10);
            } else {
              this._rkeyFlags[ch] = 0;
            }
            this._y(14, 32 | this._rkeyFlags[0] | this._rkeyFlags[1] | this._rkeyFlags[2] | this._rkeyFlags[3] | this._rkeyFlags[4] | this._rkeyFlags[5]);
          }

          const blk = this._blkFnums[ch] >> 9;
          const fnum = this._blkFnums[ch] & 0x1ff;
          this._keyFlags[ch] = key;
          const fkey = program >= 1024 ? 0 : key;
          const blk_o = Math.min(7, Math.max(0, octaveOffset + blk));
          const dl = fnum & 0xff;
          const dh = (fkey << 4) | (blk_o << 1) | (fnum >> 8);
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
      const { program, octaveOffset } = this._currentVoice[ch];
      const blk = ((regs[ah] >> 3) & 7);
      const blk_o = Math.min(7, Math.max(0, octaveOffset + blk));
      const key = program >= 1024 ? 0 : this._keyFlags[ch];
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
    // set rhythm freq
    this._y(0x16, 0x20);
    this._y(0x17, 0x50);
    this._y(0x18, 0xC0);
    this._y(0x26, 0x05);
    this._y(0x27, 0x05);
    this._y(0x28, 0x01);
    this._y(0x36, 0x00);
    this._y(0x37, 0x22);
    this._y(0x38, 0x00);
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
