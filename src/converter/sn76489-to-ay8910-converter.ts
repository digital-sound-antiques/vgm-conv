import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

const voltbl = [15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 0];

type _MixResolver = "tone" | "noise" | "mix";
type _MixChannel = "none" | 0 | 1 | 2;
type _PeriodicNoiseAssignment = "none" | "tone" | "noise" | "mix" | "env.tri" | "env.saw";

export class SN76489ToAY8910Converter extends VGMConverter {
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _freq = new Uint16Array(4);
  _ch = 0; // channel number latched
  _type = 0; // register type latched
  _atts = [15, 15, 15, 15]; // channel attenuations
  _mixChannel = 2; // the index of the channel which shared with tone and noise.
  _mixResolver: _MixResolver = "mix";
  _periodicNoiseAssignment: _PeriodicNoiseAssignment = "tone";
  _periodicNoisePitchShift: number = 4;
  _periodicNoiseAttenuation: number = 0;
  _whiteNoiseAttenuation: number = 0;  
  _periodic = false;
  _noiseFreq = 0;
  _noisePitchMap = [7, 15, 31];
  _channelAttenuationMap = [0, 0, 0, 0];

  constructor(
    from: ChipInfo,
    to: ChipInfo,
    opts: {
      mixChannel?: _MixChannel,
      mixResolver?: _MixResolver,
      periodicNoiseAssignment?: _PeriodicNoiseAssignment,
      periodicNoisePitchShift?: number,
      noisePitchMap?: number[],
      channelAttenuationMap?: number[],
      whiteNoiseAttenuation?: number,
      periodicNoiseAttenuation?: number,
    },) {
    super(from, { chip: "ay8910", index: from.index, clock: 1 / 2, relativeClock: true });
    if (opts.mixChannel != null) {
      if (opts.mixChannel == "none") {
        this._mixChannel = -1;
      } else {
        this._mixChannel = Math.min(opts.mixChannel, 2);
      }
    }
    this._mixResolver = opts.mixResolver || this._mixResolver;
    if (opts.periodicNoiseAssignment != null) {
      this._periodicNoiseAssignment = opts.periodicNoiseAssignment;
    }
    if (opts.periodicNoisePitchShift != null) {
      this._periodicNoisePitchShift = opts.periodicNoisePitchShift;
    }
    if (opts.noisePitchMap != null) {
      this._noisePitchMap = opts.noisePitchMap;
    }
    if (opts.channelAttenuationMap != null) {
      this._channelAttenuationMap = opts.channelAttenuationMap;
    }
    if (opts.whiteNoiseAttenuation != null) {
      this._whiteNoiseAttenuation = opts.whiteNoiseAttenuation;
    }
    if (opts.periodicNoiseAttenuation != null) {
      this._periodicNoiseAttenuation = opts.periodicNoiseAttenuation;
    }
  }

  _y(a: number, d: number, optimize: boolean = true) {
    const index = this.from.index;
    const addr = index === 0 ? a : a | 0x80;
    this._buf.push(
      new VGMWriteDataCommand({
        cmd: 0xa0,
        index,
        port: 0,
        addr,
        data: d
      }),
      optimize
    );
  }

  getInitialCommands(): Array<VGMCommand> {
    this._y(7, 0x38);
    switch (this._periodicNoiseAssignment) {
      case "env.saw":
        this._y(13, 8);
        break;
      case "env.tri":
        this._y(13, 14);
        break;
    }
    return this._buf.commit();
  }

  _updateSharedChannel() {
    let noiseChannel = this._mixChannel;
    let enableTone = this._atts[noiseChannel] != 0xf;
    let enableNoise = this._atts[3] != 0xf;

    let att;

    if (enableTone && enableNoise) {
      switch (this._mixResolver) {
        case "noise":
          enableTone = false;
          break;
        case "tone":
          enableNoise = false;
          att = this._atts[noiseChannel];
          break;
        default:
          break;
      }
    }

    if (enableTone && enableNoise) {
      att = Math.min(this._atts[noiseChannel], this._atts[3]);
    } else if (enableNoise) {
      att = this._atts[3];
    } else {
      att = this._atts[noiseChannel];
    }

    let env = false;
    if (this._periodic) {
      if (this._noiseFreq == 3) {
        if (enableNoise) {
          att = Math.max(0, Math.min(15, att + this._periodicNoiseAttenuation));
          switch (this._periodicNoiseAssignment) {
            case "none":
              enableNoise = false;
              break;
            case "noise":
              break;
            case "mix":
              enableTone = true;
              break;
            case "env.tri":
            case "env.saw":
              env = true;
              enableTone = enableNoise = false;
              break;
            case "tone":
            default:
              enableTone = true;
              enableNoise = false;
              break;
          }
        }
      }
    } else {
      if (enableNoise) {
        att = Math.max(0, Math.min(15, att + this._whiteNoiseAttenuation));
      }
    }

    const toneMask = enableTone ? 0 : (1 << noiseChannel);
    const noiseMask = enableNoise ? (7 & ~(1 << noiseChannel)) : 7;
    this._y(7, noiseMask << 3 | toneMask);
    this._y(8 + noiseChannel, env ? 16 : voltbl[att]);
  }

  _updateAttenuation(ch: number, rawAtt: number) {
    const att = rawAtt == 0xf ? 0xf : Math.max(0, Math.min(15, rawAtt + this._channelAttenuationMap[ch]));
    this._atts[ch] = att;
    if (0 <= this._mixChannel) {
      if (ch === this._mixChannel || ch == 3) {
        this._updateSharedChannel();
      } else {
        this._y(8 + ch, voltbl[att]);
      }
    } else {
      if (ch < 3) {
        this._y(8 + ch, voltbl[att]);
      }
    }
  }

  _updateNoise(data: number) {
    const periodic = (data & 4) ? false : true;
    const noiseFreq = (data & 3);
    if (this._periodic != periodic || this._noiseFreq != noiseFreq) {
      this._periodic = periodic;
      this._noiseFreq = noiseFreq;
      this._updateSharedChannel();
    }
    if ((data & 3) == 3) {
      this._y(6, this._freq[2] & 31);
    } else {
      this._y(6, this._noisePitchMap[data & 3]);
    }
  }

  _updateFreq(ch: number) {
    if (ch < 3) {
      let freq = this._freq[ch];
      if (ch == this._mixChannel && this._noiseFreq == 3) {
        if (this._atts[3] != 0xf && (this._atts[ch] == 0x0f || this._mixResolver == "noise")) {
          freq = Math.min(0xfff, this._freq[2] << this._periodicNoisePitchShift);
          let mfreq = null;
          switch (this._periodicNoiseAssignment) {
            case "env.tri":
              mfreq = (freq >> 5);
              break;
            case "env.saw": {
              mfreq = (freq >> 4);
              break;
            }
          }
          if (mfreq != null) {
            this._y(11, mfreq & 0xff);
            this._y(12, mfreq >> 8);
          }
        }
      }
      this._y(ch * 2, freq & 0xff);
      this._y(ch * 2 + 1, freq >> 8);
    }
    if (ch != this._mixChannel) {
      this._updateFreq(this._mixChannel);
    }
  }

  _convert(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const { data } = cmd;

    if (data & 0x80) {
      const ch = (data >> 5) & 3;
      const type = (data >> 4) & 1;
      this._ch = ch;
      this._type = type;
      if (type) {
        this._updateAttenuation(ch, data & 0xf);
      } else {
        if (ch < 3) {
          this._freq[ch] = (this._freq[ch] & 0x3f0) | (data & 0xf);
        } else {
          this._updateNoise(data);
        }
      }
      this._updateFreq(ch);
    } else {
      const ch = this._ch;
      const type = this._type;
      if (type) {
        this._updateAttenuation(ch, data & 0xf);
      } else {
        if (ch < 3) {
          this._freq[ch] = ((data & 0x3f) << 4) | (this._freq[ch] & 0xf);
        } else {
          this._updateNoise(data);
        }
      }
      this._updateFreq(ch);
    }
    return this._buf.commit();
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === "sn76489" && cmd.index == this.from.index) {
      return this._convert(cmd);
    }
    return [cmd];
  }
}
