import { VGMWriteDataCommand } from "vgm-parser";

export default class VGMWriteDataCommandBuffer {
  _outRegs: Int16Array[] = [];
  _buf: Array<VGMWriteDataCommand> = [];
  constructor(maxRegs: number, maxPorts: number = 1) {
    for (let i = 0; i < maxPorts; i++) {
      this._outRegs.push(new Int16Array(maxRegs).fill(-1));
    }
  }

  push(cmd: VGMWriteDataCommand, optimize = true) {
    if (optimize) {
      if (this._outRegs[cmd.port][cmd.addr] !== cmd.data) {
        const index = this._buf.findIndex(e => e.port === cmd.port && e.addr === cmd.addr);
        if (0 <= index) {
          this._buf.splice(index, 1);
        }
        this._buf.push(cmd);
      }
    } else {
      this._buf.push(cmd);
    }
  }

  commit(): Array<VGMWriteDataCommand> {
    const result = Array<VGMWriteDataCommand>();
    for (const cmd of this._buf) {
      this._outRegs[cmd.port][cmd.addr] = cmd.data;
      result.push(cmd);
    }
    this._buf = [];
    return result;
  }
}
