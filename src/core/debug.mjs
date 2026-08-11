export class TraceRing {
  constructor(capacity = 512) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('capacity must be a positive integer');
    this.capacity = capacity;
    this.records = [];
  }

  push(record) {
    const frozen = Object.freeze({ ...record });
    this.records.push(frozen);
    if (this.records.length > this.capacity) this.records.shift();
    return frozen;
  }

  clear() { this.records.length = 0; }
  snapshot() { return this.records.slice(); }
  tail(count = 32) { return this.records.slice(-Math.max(0, count)); }
}

export class WatchpointSet {
  constructor() { this.points = new Map(); }
  add(address, kind = 'rw', label = '') {
    if (!Number.isInteger(address) || address < 0 || address > 0xffff) throw new Error('watchpoint address out of range');
    if (!['r', 'w', 'rw'].includes(kind)) throw new Error('watchpoint kind must be r, w or rw');
    this.points.set(address & 0xffff, { kind, label });
  }
  remove(address) { this.points.delete(address & 0xffff); }
  match(address, access) {
    const p = this.points.get(address & 0xffff);
    return !!p && (p.kind === 'rw' || p.kind === access);
  }
}

export function hex8(v) { return (v & 0xff).toString(16).toUpperCase().padStart(2, '0'); }
export function hex16(v) { return (v & 0xffff).toString(16).toUpperCase().padStart(4, '0'); }
