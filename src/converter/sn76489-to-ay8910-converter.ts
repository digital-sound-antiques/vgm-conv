import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

const voltbl = [15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 0];

export class SN76489ToAY8910Converter extends VGMConverter {
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _freq = new Uint16Array(4);
  _ch = 0;
  _type = 0;

  constructor(from: ChipInfo, to: ChipInfo, opts: { useTestMode?: boolean; decimation?: number }) {
    super(from, { chip: "ay8910", index: from.index, clock: 1 / 2, relativeClock: true });
  }

  _y(a: number, d: number) {
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
      false
    );
  }

  getInitialCommands(): Array<VGMCommand> {
    this._y(7, 0x38);
    return this._buf.commit();
  }

  _convert(cmd: VGMWriteDataCommand): Array<VGMCommand> {
    const { data } = cmd;

    if (data & 0x80) {
      const ch = (data >> 5) & 3;
      const type = (data >> 4) & 1;
      this._ch = ch;
      this._type = type;
      if (type) {
        if (ch < 3) {
          this._y(8 + ch, voltbl[data & 0xf]);
        }
      } else {
        if (ch < 3) {
          const new_freq = (this._freq[ch] & 0x3f0) | (data & 0xf);
          this._y(ch * 2, new_freq & 0xff);
          this._freq[ch] = new_freq;
        }
      }
    } else {
      const ch = this._ch;
      const type = this._type;
      if (type) {
        if (ch < 3) {
          this._y(8 + ch, voltbl[data & 0xf]);
        }
      } else {
        if (ch < 3) {
          const new_freq = ((data & 0x3f) << 4) | (this._freq[ch] & 0xf);
          this._y(ch * 2, new_freq & 0xff);
          this._y(ch * 2 + 1, new_freq >> 8);
          this._freq[ch] = new_freq;
        }
      }
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
