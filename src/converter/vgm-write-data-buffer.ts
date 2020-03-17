import { VGMWriteDataCommand, VGMCommand } from "vgm-parser";

export default class VGMWriteDataCommandBuffer {
  _outRegs: Int16Array[] = [];
  _buf: Array<VGMCommand> = [];
  constructor(maxRegs: number, maxPorts: number = 1) {
    for (let i = 0; i < maxPorts; i++) {
      this._outRegs.push(new Int16Array(maxRegs).fill(-1));
    }
  }

  push(cmd: VGMCommand, optimize = true) {
    if (cmd instanceof VGMWriteDataCommand && optimize) {
      if (this._outRegs[cmd.port][cmd.addr] !== cmd.data) {
        const index = this._buf.findIndex(e => {
          if (e instanceof VGMWriteDataCommand) {
            return e.port === cmd.port && e.addr === cmd.addr;
          }
          return false;
        });
        if (0 <= index) {
          this._buf.splice(index, 1);
        }
        this._buf.push(cmd);
      }
    } else {
      this._buf.push(cmd);
    }
  }

  commit(): Array<VGMCommand> {
    const result = Array<VGMCommand>();
    for (const cmd of this._buf) {
      if (cmd instanceof VGMWriteDataCommand) {
        this._outRegs[cmd.port][cmd.addr] = cmd.data;
      }
      result.push(cmd);
    }
    this._buf = [];
    return result;
  }
}
