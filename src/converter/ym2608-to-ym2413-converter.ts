import { OPNToYM2413Converter } from "./opn-to-ym2413-converter";
import { ChipInfo } from "./vgm-converter";

export class YM2608ToYM2413Converter extends OPNToYM2413Converter {
  constructor(from: ChipInfo, to: ChipInfo, opts: any) {
    super(from, { chip: "ym2413", index: from.index, clock: 1 / 2, relativeClock: true }, opts);
  }
}
