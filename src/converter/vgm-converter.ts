import { VGMCommand, ChipName } from "vgm-parser";

export type ChipInfo = {
  chip: ChipName;
  subModule?: "fm" | "ssg" | "adpcm" | "dac" | string | null;
  index: number;
  clock: number;
  relativeClock?: boolean;
};

export abstract class VGMConverter {
  from: ChipInfo;
  to: ChipInfo;

  constructor(from: ChipInfo, to: ChipInfo) {
    this.from = from;
    this.to = to;
  }

  getInitialCommands(): Array<VGMCommand> {
    return [];
  }
  abstract convertCommand(cmd: VGMCommand): Array<VGMCommand>;

  get convertedChipInfo(): ChipInfo {
    const clock = this.to.relativeClock ? this.from.clock * this.to.clock : this.to.clock;
    return {
      chip: this.to.chip,
      index: this.to.index,
      clock
    };
  }
}

export abstract class VGMClockConverter extends VGMConverter {
  _defaultClock: number;
  constructor(from: ChipInfo, toClock: number, defaultClock: number) {
    super(from, { ...from, clock: toClock || defaultClock });
    this._defaultClock = defaultClock;
  }

  get defaultClock() {
    return this._defaultClock;
  }
}
