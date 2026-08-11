import { TraceRing, WatchpointSet } from './debug.mjs';
import { parseINES } from './ines.mjs';
import { createCartridge } from './cartridge.mjs';
import { NESBus, PPURegisterStub, APUIOStub } from './nesbus.mjs';
import { CPU6502 } from './cpu6502.mjs';

export class NESMachine {
  constructor({ traceCapacity = 8192 } = {}) {
    this.trace = new TraceRing(traceCapacity);
    this.watchpoints = new WatchpointSet();
    this.loaded = false;
  }

  loadROM(input) {
    this.parsed = parseINES(input);
    this.cartridge = createCartridge(this.parsed);
    this.ppu = new PPURegisterStub();
    this.apuIo = new APUIOStub();
    this.bus = new NESBus({ cartridge: this.cartridge, ppu: this.ppu, apuIo: this.apuIo, watchpoints: this.watchpoints });
    this.trace.clear();
    this.cpu = new CPU6502(this.bus, { trace: this.trace });
    this.cpu.reset();
    this.loaded = true;
    return this.snapshot();
  }

  ensureLoaded() { if (!this.loaded) throw new Error('No ROM loaded'); }

  reset() {
    this.ensureLoaded();
    this.trace.clear();
    this.bus.clearBreak();
    this.cpu.reset();
    return this.snapshot();
  }

  step(count = 1) {
    this.ensureLoaded();
    if (!Number.isInteger(count) || count < 1 || count > 1_000_000) throw new Error('step count must be 1..1,000,000');
    let executed = 0, spent = 0;
    while (executed < count) {
      spent += this.cpu.step();
      executed++;
      if (this.bus.breakReason) break;
    }
    return { executed, spent, breakReason: this.bus.breakReason, snapshot: this.snapshot() };
  }

  snapshot() {
    this.ensureLoaded();
    return {
      mapper: this.cartridge.mapper,
      mirroring: this.cartridge.mirroring,
      chrIsRam: this.cartridge.chrIsRam,
      cpu: this.cpu.snapshot(),
      breakReason: this.bus.breakReason,
    };
  }
}
