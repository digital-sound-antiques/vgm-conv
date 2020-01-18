import { VGMConverter, ChipInfo } from "./vgm-converter";
import { VGMCommand, VGMWriteDataCommand } from "vgm-parser";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";

const voltbl = [15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 0];

function fdiv2fnum(fdiv: number) {
  if (fdiv == 0) return 0;
  const clk = 1.0;
  const freq = clk / (2 * 16 * fdiv);
  let fnum = Math.round((144 * freq * (1 << 20)) / clk);
  let blk = 0;
  while (fnum > 0x7ff) {
    fnum >>= 1;
    blk++;
  }
  blk = Math.min(7, blk);
  return (blk << 11) | fnum;
}

export class SN76489ToOPNConverter extends VGMConverter {
  _buf = new VGMWriteDataCommandBuffer(256, 1);
  _fdiv = new Uint16Array(4);
  _ch = 0;
  _type = 0;
  _command: number = 0;

  constructor(from: ChipInfo, to: ChipInfo, opts: { useTestMode?: boolean; decimation?: number }) {
    super(from, { chip: to.chip, index: from.index, clock: to.chip === "ym2203" ? 1 : 2, relativeClock: true });
    switch (to.chip) {
      case "ym2612":
        this._command = from.index === 0 ? 0x52 : 0xa2;
        break;
      case "ym2203":
        this._command = from.index === 0 ? 0x55 : 0xa5;
        break;
      case "ym2608":
        this._command = from.index === 0 ? 0x56 : 0xa6;
        break;
      default:
        throw new Error(`Invalid chip: ${to.chip}.`);
    }
  }

  _y(a: number, d: number) {
    this._buf.push(
      new VGMWriteDataCommand({
        cmd: this._command,
        index: this.from.index,
        port: 0,
        addr: a,
        data: d
      }),
      false
    );
  }

  _makeSQRVoice(ch: number) {
    this._y(0x30 + ch, 0x02); // FM 1_1 DT/MULTI
    this._y(0x38 + ch, 0x02); // FM 1_2 DT/MULTI
    this._y(0x34 + ch, 0x02); // FM 1_3 DT/MULTI
    this._y(0x3c + ch, 0x01); // FM 1_4 DT/MULTI
    this._y(0x40 + ch, 0x1e); // FM 1_1 TL
    this._y(0x48 + ch, 0x20); // FM 1_2 TL
    this._y(0x44 + ch, 0x30); // FM 1_3 TL
    this._y(0x4c + ch, 0x7f); // FM 1_4 TL
    this._y(0x50 + ch, 0x1f); // FM 1_1 KS/AR
    this._y(0x58 + ch, 0x1f); // FM 1_2 KS/AR
    this._y(0x54 + ch, 0x1f); // FM 1_3 KS/AR
    this._y(0x5c + ch, 0x1f); // FM 1_4 KS/AR
    this._y(0x60 + ch, 0x00); // FM 1_1 AM/DR
    this._y(0x68 + ch, 0x00); // FM 1_2 AM/DR
    this._y(0x64 + ch, 0x00); // FM 1_3 AM/DR
    this._y(0x6c + ch, 0x00); // FM 1_4 AM/DR
    this._y(0x70 + ch, 0x00); // FM 1_1 SR
    this._y(0x78 + ch, 0x00); // FM 1_2 SR
    this._y(0x74 + ch, 0x00); // FM 1_3 SR
    this._y(0x7c + ch, 0x00); // FM 1_4 SR
    this._y(0x80 + ch, 0x00); // FM 1_1 SL/RR
    this._y(0x88 + ch, 0x00); // FM 1_2 SL/RR
    this._y(0x84 + ch, 0x00); // FM 1_3 SL/RR
    this._y(0x8c + ch, 0x0f); // FM 1_4 SL/RR
    this._y(0xb0 + ch, 0x3b); // FM 1 FB:7/ALG:3
    this._y(0xb4 + ch, 0xc0); // FM 1 LR/AMS/PMS
  }

  getInitialCommands(): Array<VGMCommand> {
    this._y(7, 0x01c);
    this._makeSQRVoice(0);
    this._makeSQRVoice(1);
    this._makeSQRVoice(2);
    this._y(0x28, 0xf0); // KEY-ON FM 1
    this._y(0x28, 0xf1); // KEY-ON FM 2
    this._y(0x28, 0xf2); // KEY-ON FM 3
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
        const v = data & 0xf;
        if (ch < 3) {
          const tl = v == 0xf ? 0x7f : Math.round(((data & 0xf) * 2) / 0.75 + 4);
          this._y(0x4c + ch, tl);
        } else {
          this._y(10, voltbl[v]);
        }
      } else {
        if (ch < 3) {
          const new_fdiv = (this._fdiv[ch] & 0x3f0) | (data & 0xf);
          const blk_fnum = fdiv2fnum(new_fdiv);
          this._y(0xa4 + ch, blk_fnum >> 8);
          this._y(0xa0 + ch, blk_fnum & 0xff);
          this._fdiv[ch] = new_fdiv;
        } else {
          const n = data & 0x3;
          switch (n) {
            case 0:
            case 1:
            case 2:
              this._y(0x6, Math.min(31, 16 << n));
              break;
            case 3:
              const fdiv = Math.min(31, Math.round((this._fdiv[2] + 1) << 2));
              this._y(0x6, fdiv);
              break;
          }
          this._fdiv[ch] = n;
        }
      }
    } else {
      const ch = this._ch;
      const type = this._type;
      if (type) {
        const v = data & 0xf;
        if (ch < 3) {
          const tl = v == 0xf ? 0x7f : Math.round(((data & 0xf) * 2) / 0.75 + 4);
          this._y(0x4c + ch, tl);
        } else {
          this._y(10, voltbl[v]);
        }
      } else {
        if (ch < 3) {
          const new_fdiv = ((data & 0x3f) << 4) | (this._fdiv[ch] & 0xf);
          const blk_fnum = fdiv2fnum(new_fdiv);
          this._y(0xa4 + ch, blk_fnum >> 8);
          this._y(0xa0 + ch, blk_fnum & 0xff);
          this._fdiv[ch] = new_fdiv;
          if (ch === 2 && this._fdiv[3] == 3) {
            const freq = Math.min(31, Math.round((this._fdiv[2] + 1) << 2));
            this._y(0x6, freq);
          }
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
