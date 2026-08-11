import fs from 'node:fs';
import { FlatMemoryBus } from '../src/core/bus.mjs';
import { CPU6502 } from '../src/core/cpu6502.mjs';

const file = process.argv[2];
if (!file) throw new Error('usage: node tests/klaus.mjs <6502_functional_test.bin>');
const image = new Uint8Array(fs.readFileSync(file));
if (image.length !== 0x10000) throw new Error(`Klaus image must be 65536 bytes, got ${image.length}`);
const bus = new FlatMemoryBus();
bus.mem.set(image);
// NES defaults to binary arithmetic; decimal mode is enabled only for this generic NMOS oracle.
const cpu = new CPU6502(bus, { trace: null, decimalArithmetic: true });
cpu.resetState();
cpu.pc = 0x0400;
const SUCCESS_PC = 0x3469, MAX_INSTRUCTIONS = 100_000_000;
let samePcCount = 0;
for (let i = 0; i < MAX_INSTRUCTIONS; i++) {
  const before = cpu.pc;
  cpu.step();
  if (cpu.pc === before) {
    if (++samePcCount >= 2) {
      if (cpu.pc === SUCCESS_PC) {
        console.log(`PASS Klaus Dormann 6502 functional test at $${SUCCESS_PC.toString(16).toUpperCase()} after ${i + 1} instructions`);
        process.exit(0);
      }
      throw new Error(`Klaus functional test trapped at $${cpu.pc.toString(16).toUpperCase().padStart(4,'0')} after ${i + 1} instructions; A=$${cpu.a.toString(16).padStart(2,'0')} X=$${cpu.x.toString(16).padStart(2,'0')} Y=$${cpu.y.toString(16).padStart(2,'0')} SP=$${cpu.sp.toString(16).padStart(2,'0')} P=$${cpu.p.toString(16).padStart(2,'0')}`);
    }
  } else samePcCount = 0;
}
throw new Error(`Klaus functional test exceeded ${MAX_INSTRUCTIONS} instructions at PC=$${cpu.pc.toString(16).toUpperCase()}`);
