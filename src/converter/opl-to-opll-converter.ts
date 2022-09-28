import { VGMConverter, ChipInfo } from "./vgm-converter";
import VGMWriteDataCommandBuffer from "./vgm-write-data-buffer";
import { VGMWriteDataCommand, VGMCommand } from "vgm-parser";
import { OPLVoice } from "ym-voice";

export class OPLToOPLLConverter extends VGMConverter {
    _regs = new Uint8Array(256);
    _buf = new VGMWriteDataCommandBuffer(256, 1);
    _voices: Array<{
        program: number;
        volumeOffset: number;
        octaveOffset: number;
    }> = [];

    constructor(from: ChipInfo, to: ChipInfo, opts: { ssgAttenuation?: number }) {
        super(from, { chip: to.chip, index: from.index, clock: 1, relativeClock: true });
        for (let i = 0; i < 16; i++) {
            this._voices.push({ program: 3, volumeOffset: 0, octaveOffset: 0 });
        }
    }

    _setupRhythm() {
        this._y(0x16, 0x20);
        this._y(0x17, 0x50);
        this._y(0x18, 0xC0);
        this._y(0x26, 0x05);
        this._y(0x27, 0x05);
        this._y(0x28, 0x01);
        
        const v_bd = (this._regs[0x53] & 0x1f) >> 2;
        const v_hh = (this._regs[0x51] & 0x1f) >> 2;
        const v_sd = (this._regs[0x54] & 0x1f) >> 2;
        const v_tom = (this._regs[0x52] & 0x1f) >> 2;
        const v_cym = (this._regs[0x55] & 0x1f) >> 2;

        this._y(0x38, v_bd);
        this._y(0x39, v_hh << 4 | v_sd);
        this._y(0x40, v_tom << 4 | v_cym);
    }

    _y(addr: number, data: number, optimize: boolean = true) {
        const index = this.from.index;
        this._buf.push(new VGMWriteDataCommand({ cmd: 0x51, index, addr, data }), optimize);
    }

    _getVoiceArr(ch: number) {
        const off = Math.floor(ch / 3) * 8 + (ch % 3);
        return [
            this._regs[0x20 + off],
            this._regs[0x23 + off],
            this._regs[0x40 + off],
            this._regs[0x43 + off],
            this._regs[0x60 + off],
            this._regs[0x63 + off],
            this._regs[0x80 + off],
            this._regs[0x83 + off],
            0x00,
            this._regs[0xc0 + ch],
        ];
    }

    _applyVoice(ch: number) {
        const opl = OPLVoice.decode(this._getVoiceArr(ch));
        const enc = opl.toOPLLVoice().encode();
        for (let i = 0; i < 8; i++) {
            this._y(i, enc[i]);
        }
    }

    _estimateVoice(ch: number) {
        const opl = OPLVoice.decode(this._getVoiceArr(ch));
        const inst = opl.toOPLLROMVoice();
        this._voices[ch] = inst;
    }

    _key(ch: number, kon: number, blk: number, fnum: number) {
        const vdef = this._voices[ch];
        const _blk = Math.min(7, Math.max(0, blk + vdef.octaveOffset));
        this._y(0x10 + ch, fnum & 0xff);
        this._y(0x20 + ch, (kon << 4) | (_blk << 1) | (fnum >> 8));
    }

    convertCommand(cmd: VGMCommand): Array<VGMCommand> {

        if (cmd instanceof VGMWriteDataCommand &&
            (cmd.chip === "y8950" || cmd.chip === "ym3526" || cmd.chip === "ym3812") &&
            cmd.index === this.from.index) {
            this._regs[cmd.addr] = cmd.data;

            if (cmd.addr == 0xbd) {
                this._y(0x0e, cmd.data);
                if (cmd.data & 32) {
                    this._setupRhythm();
                }
            } else if ((0x40 <= cmd.addr && cmd.addr <= 0x55)) {
                const ch = ((cmd.addr & 0x1f) >> 3) * 3 + ((cmd.addr & 0x7) % 3);
                if (ch < 9) {
                    // TOTAL LEVEL
                    if ((cmd.addr & 1) === 1) {
                        this._estimateVoice(ch);
                        const vdef = this._voices[ch];
                        const inst = vdef.program;
                        const vol = Math.min(15, Math.max(0, (cmd.data & 0x3f) >> 2));
                        this._y(0x30 + ch, (inst << 4 | vol));
                    }
                }
            } else if (0xc0 <= cmd.addr && cmd.addr <= 0xc8) {
                const ch = cmd.addr & 0xf;
                if (ch < 9) {
                    this._estimateVoice(ch);
                    const vdef = this._voices[ch];
                    const inst = vdef.program;
                    const vol = Math.min(15, Math.max(0, (cmd.data & 0x3f) >> 2));
                    this._y(0x30 + ch, (inst << 4 | vol));
                }
            } else if ((0xa0 <= cmd.addr && cmd.addr <= 0xa8) || (0xb0 <= cmd.addr && cmd.addr <= 0xb8)) {
                // KEYON - BLOCK - FNUM
                const rflag = (this._regs[0xbd] & 32);
                const ch = cmd.addr & 0xf;
                if (ch < 9) {
                    let blkfnum = (this._regs[0xb0 + ch] << 8 | this._regs[0xa0 + ch]) >> 1;
                    this._key(ch, (blkfnum >> 12) & 1, (blkfnum >> 9) & 7, blkfnum & 0x1ff);
                }
            }
            return this._buf.commit();
        }
        return [cmd];
    }
}

