import { OPNToYM2413Converter } from "./opn-to-ym2413-converter";
import { ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand, VGMWaitWordCommand, VGMWrite2ACommand, VGMWaitNibbleCommand, VGMSeekPCMCommand, VGMDataBlockCommand } from "vgm-parser";
import { YM2413DACTable } from "./ym2413-dac-table";

export class YM2612ToYM2413Converter extends OPNToYM2413Converter {
  rootPcmChannel = 6;

  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ym2413", index: from.index, clock: 1 / 2, relativeClock: true }, opts);
  }

  getInitialCommands(): Array<VGMCommand> {
    // select FM 9-ch mode
    this._y(14, 0);

    if (this.opts.useTestMode) {
      this._y(15, 4);
      // Set saw wave to user-defined voice.
      this._y(1, 0x2c);
      this._y(0, 0x2c);
      this._y(2, 0x28);
      this._y(3, 0x07);
      this._y(4, 0xf0);
      this._y(5, 0xf0);
      this._y(6, 0x0f);
      this._y(7, 0x0f);

      this._y(48 + this.rootPcmChannel, 0, false);
      this._y(49 + this.rootPcmChannel, 0, false);
      this._y(50 + this.rootPcmChannel, 0, false);

      this._y(32 + this.rootPcmChannel, 0x1e, false);
      this._y(33 + this.rootPcmChannel, 0x1e, false);
      this._y(34 + this.rootPcmChannel, 0x1e, false);
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

      const goalClock = this.to.relativeClock ? (this.from.clock * this.to.clock) : (this.to.clock || 3579545);
      // wait until 1/4 cycle of phase generator
      const freq = (fnum * goalClock) / 72 / (1 << 19);
      const cycleInSeconds = 1.0 / freq;
      const nnnn = Math.round(44100 * (cycleInSeconds / 4));
      this._buf.push(new VGMWaitWordCommand({ count: nnnn }), false);

      // stop phase generator
      this._y(21, 0, false);
      this._y(22, 0, false);
      this._y(23, 0, false);
      this._y(24, 0, false);
    }
    return this._buf.commit();
  }

  _pcmData = new Uint8Array();
  _pcmIndex = 0;

  convert2A(cmd: VGMWrite2ACommand): VGMCommand[] {
    const v = this._pcmData[this._pcmIndex];
    this._pcmIndex++;

    if (this.opts.decimation <= 1 || this._div % this.opts.decimation !== 0) {
      if (this.opts.useTestMode) {
        const vv = 47 + Math.round((208 * v) / 255);
        this._y(16 + this.rootPcmChannel, vv, false);
        this._y(17 + this.rootPcmChannel, vv, false);
        this._y(18 + this.rootPcmChannel, vv, false);
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

  convertSeekPCM(cmd: VGMSeekPCMCommand): Array<VGMCommand> {
    this._pcmIndex = cmd.offset;
    return [];
  }

  convertDataBlock(cmd: VGMDataBlockCommand): Array<VGMCommand> {
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
        if (!this.opts.useTestMode) {
          return this.convertFM(cmd);
        }
        return [];
      }
    }
    if (cmd instanceof VGMDataBlockCommand && cmd.chip === "ym2612") {
      if (convertDAC) {
        return this.convertDataBlock(cmd);
      }
    }
    if (cmd instanceof VGMWrite2ACommand) {
      if (convertDAC) {
        return this.convert2A(cmd);
      }
    }
    if (cmd instanceof VGMSeekPCMCommand) {
      if (convertDAC) {
        return this.convertSeekPCM(cmd);
      }
    }
    return [cmd];
  }
}
