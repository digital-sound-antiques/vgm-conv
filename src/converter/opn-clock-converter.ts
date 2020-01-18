import { ChipInfo, VGMClockConverter } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand, ChipName } from "vgm-parser";
import { AY8910ClockConverter } from "./ay8910-clock-converter";

export class OPNClockConverterBase extends VGMClockConverter {
  _ratio: number;
  _regs = [new Uint8Array(256), new Uint8Array(256)];
  _target: ChipName;
  _ssgConverter: AY8910ClockConverter | null = null;
  constructor(target: ChipName, from: ChipInfo, toClock: number, opts: any) {
    super(from, toClock, 3579545);
    this._target = target;
    this._ratio = this.to.clock / from.clock;

    if (this.from.chip === "ym2608" || this.from.chip === "ym2203") {
      if (this.from.subModule == null || this.from.subModule === "ssg") {
        this._ssgConverter = new AY8910ClockConverter(from, this.to.clock, opts);
      }
    }
  }

  convertWriteDataCommand(cmd: VGMWriteDataCommand): VGMWriteDataCommand[] {
    const { port, addr, data } = cmd;
    if (this._ratio !== 1.0) {
      const regs = this._regs[port];
      regs[addr] = data;
      if (0xa0 <= addr && addr < 0xb0) {
        const al = 0xa0 + (addr & 3) + (addr & 8);
        const ah = al + 4;
        const fnum = ((regs[ah] & 7) << 8) | regs[al];
        let new_fnum = Math.round(fnum / this._ratio);
        let new_blk = (regs[ah] >> 3) & 7;
        while (new_fnum > 0x7ff) {
          new_fnum >>= 1;
          new_blk++;
        }
        if (new_blk > 7) {
          new_blk = 7;
          new_fnum = 0x7ff;
        }
        const dl = new_fnum & 0xff;
        const dh = (new_blk << 3) | (new_fnum >> 8);
        return [cmd.copy({ addr: ah, data: dh }), cmd.copy({ addr: al, data: dl })];
      }
    }
    return [cmd];
  }

  convertCommand(cmd: VGMCommand): Array<VGMCommand> {
    const convertFM = this.from.subModule == null || this.from.subModule === "fm";
    if (cmd instanceof VGMWriteDataCommand && cmd.chip === this._target && cmd.index === this.from.index) {
      if (cmd.addr < 0x10) {
        if (this._ssgConverter) {
          return this._ssgConverter.convert(cmd);
        }
      } else {
        if (convertFM) {
          return this.convertWriteDataCommand(cmd);
        }
      }
    }
    return [cmd];
  }
}

export class YM2203ClockConverter extends OPNClockConverterBase {
  constructor(from: ChipInfo, toClock: number, opts: any) {
    super("ym2203", from, toClock, 4000000);
  }
}

export class YM2612ClockConverter extends OPNClockConverterBase {
  constructor(from: ChipInfo, toClock: number, opts: any) {
    super("ym2612", from, toClock, 7670454);
  }
}

export class YM2608ClockConverter extends OPNClockConverterBase {
  constructor(from: ChipInfo, toClock: number, opts: any) {
    super("ym2608", from, toClock, 7987200);
  }
}
