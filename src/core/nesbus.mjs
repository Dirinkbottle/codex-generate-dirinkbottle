import { WatchpointSet } from './debug.mjs';

export class PPURegisterStub {
  constructor() { this.registers = new Uint8Array(8); this.accessLog = []; }
  cpuRead(address) {
    const r = address & 7, value = this.registers[r];
    this.accessLog.push({ kind: 'r', address: 0x2000 | r, value });
    return value;
  }
  cpuWrite(address, value) {
    const r = address & 7, v = value & 0xff;
    this.registers[r] = v;
    this.accessLog.push({ kind: 'w', address: 0x2000 | r, value: v });
  }
}

export class APUIOStub {
  constructor() { this.registers = new Uint8Array(0x20); this.accessLog = []; }
  cpuRead(address) {
    const a = address & 0xffff, value = this.registers[a - 0x4000] ?? 0;
    this.accessLog.push({ kind: 'r', address: a, value });
    return value;
  }
  cpuWrite(address, value) {
    const a = address & 0xffff, v = value & 0xff;
    if (a < 0x4020) this.registers[a - 0x4000] = v;
    this.accessLog.push({ kind: 'w', address: a, value: v });
  }
}

export class NESBus {
  constructor({ cartridge = null, ppu = new PPURegisterStub(), apuIo = new APUIOStub(), watchpoints = new WatchpointSet() } = {}) {
    this.ram = new Uint8Array(0x800);
    this.cartridge = cartridge;
    this.ppu = ppu;
    this.apuIo = apuIo;
    this.watchpoints = watchpoints;
    this.breakReason = null;
    // Deterministic latch approximation until device-accurate open bus is modeled.
    this.openBus = 0;
  }

  attachCartridge(cartridge) { this.cartridge = cartridge; return this; }
  clearBreak() { this.breakReason = null; }

  read8(address, source = 'cpu') {
    const a = address & 0xffff;
    let value;
    if (a < 0x2000) value = this.ram[a & 0x07ff];
    else if (a < 0x4000) value = this.ppu.cpuRead(0x2000 | (a & 7));
    else if (a < 0x4020) value = this.apuIo.cpuRead(a);
    else {
      const mapped = this.cartridge?.cpuRead(a);
      value = mapped == null ? this.openBus : mapped;
    }
    this.openBus = value & 0xff;
    if (this.watchpoints.match(a, 'r')) this.breakReason = { type: 'watchpoint', access: 'r', address: a, value: this.openBus, source };
    return this.openBus;
  }

  write8(address, value, source = 'cpu') {
    const a = address & 0xffff, v = value & 0xff;
    this.openBus = v;
    if (a < 0x2000) this.ram[a & 0x07ff] = v;
    else if (a < 0x4000) this.ppu.cpuWrite(0x2000 | (a & 7), v);
    else if (a < 0x4020) this.apuIo.cpuWrite(a, v);
    else this.cartridge?.cpuWrite(a, v);
    if (this.watchpoints.match(a, 'w')) this.breakReason = { type: 'watchpoint', access: 'w', address: a, value: v, source };
  }

  read16(address, source = 'cpu') {
    const a = address & 0xffff;
    return this.read8(a, source) | (this.read8((a + 1) & 0xffff, source) << 8);
  }
}
