import { TraceRing, WatchpointSet } from './debug.mjs';
export class FlatMemoryBus {
  constructor({ trace = new TraceRing(), watchpoints = new WatchpointSet() } = {}) {
    this.mem = new Uint8Array(0x10000);
    this.trace = trace;
    this.watchpoints = watchpoints;
    this.breakReason = null;
  }
  read8(address, source = 'cpu') {
    const a = address & 0xffff;
    const value = this.mem[a];
    if (this.watchpoints.match(a, 'r')) this.breakReason = { type: 'watchpoint', access: 'r', address: a, value, source };
    return value;
  }
  write8(address, value, source = 'cpu') {
    const a = address & 0xffff;
    const v = value & 0xff;
    this.mem[a] = v;
    if (this.watchpoints.match(a, 'w')) this.breakReason = { type: 'watchpoint', access: 'w', address: a, value: v, source };
  }
  peek8(address) { return this.mem[address & 0xffff]; }
  read16(address, source = 'cpu') {
    const lo = this.read8(address, source);
    const hi = this.read8((address + 1) & 0xffff, source);
    return lo | (hi << 8);
  }
  load(address, bytes) {
    const start = address & 0xffff;
    if (start + bytes.length > 0x10000) throw new Error('load exceeds 64KiB bus');
    this.mem.set(bytes, start);
  }
}
