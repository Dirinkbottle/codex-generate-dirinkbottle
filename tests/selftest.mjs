import { TraceRing, WatchpointSet } from '../src/core/debug.mjs';
import { FlatMemoryBus } from '../src/core/bus.mjs';
import { parseINES } from '../src/core/ines.mjs';
import { CPU6502, FLAG } from '../src/core/cpu6502.mjs';

export function runSelfTests() {
  const results = [];
  const test = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error?.stack || String(error) }); }
  };
  const eq = (actual, expected, msg = '') => { if (actual !== expected) throw new Error(`${msg} expected ${expected}, got ${actual}`); };
  const ok = (cond, msg = 'assertion failed') => { if (!cond) throw new Error(msg); };

  test('TraceRing evicts oldest records', () => {
    const t = new TraceRing(2); t.push({ n: 1 }); t.push({ n: 2 }); t.push({ n: 3 });
    eq(t.snapshot().length, 2); eq(t.snapshot()[0].n, 2); eq(t.snapshot()[1].n, 3);
  });

  test('Watchpoints stop on matching access only', () => {
    const w = new WatchpointSet(); const bus = new FlatMemoryBus({ watchpoints: w });
    w.add(0x1234, 'w', 'sentinel'); bus.read8(0x1234); eq(bus.breakReason, null);
    bus.write8(0x1234, 0x56); eq(bus.breakReason.address, 0x1234); eq(bus.breakReason.value, 0x56);
  });

  test('iNES parser handles mapper/mirroring/PRG/CHR', () => {
    const rom = new Uint8Array(16 + 16384 + 8192);
    rom.set([0x4e,0x45,0x53,0x1a, 1,1, 0x23,0x10], 0);
    rom[16] = 0xaa; rom[16 + 16384] = 0xbb;
    const c = parseINES(rom);
    eq(c.mapper, 0x12); eq(c.mirroring, 'vertical'); ok(c.hasBattery); eq(c.prgRom[0], 0xaa); eq(c.chrRom[0], 0xbb);
  });

  test('iNES parser rejects malformed and NES2 headers', () => {
    let threw = false; try { parseINES(new Uint8Array(16)); } catch { threw = true; } ok(threw);
    const rom = new Uint8Array(16); rom.set([0x4e,0x45,0x53,0x1a,0,0,0,0x08]);
    threw = false; try { parseINES(rom); } catch (e) { threw = /NES 2\.0/.test(e.message); } ok(threw);
  });

  test('CPU reset reads little-endian reset vector', () => {
    const bus = new FlatMemoryBus(); bus.write8(0xfffc, 0x34); bus.write8(0xfffd, 0x12);
    const cpu = new CPU6502(bus); cpu.reset(); eq(cpu.pc, 0x1234); eq(cpu.sp, 0xfd); ok(cpu.getFlag(FLAG.I));
  });

  test('LDA/STA/INX update state and flags', () => {
    const bus = new FlatMemoryBus(); bus.load(0x8000, Uint8Array.from([0xa9,0x00,0xa2,0xff,0xe8,0xa9,0x80,0x8d,0x00,0x20,0x00]));
    bus.write8(0xfffc,0x00); bus.write8(0xfffd,0x80);
    const cpu = new CPU6502(bus); cpu.reset();
    cpu.step(); eq(cpu.a,0); ok(cpu.getFlag(FLAG.Z));
    cpu.step(); eq(cpu.x,0xff); ok(cpu.getFlag(FLAG.N));
    cpu.step(); eq(cpu.x,0); ok(cpu.getFlag(FLAG.Z));
    cpu.step(); eq(cpu.a,0x80); ok(cpu.getFlag(FLAG.N));
    cpu.step(); eq(bus.read8(0x2000),0x80);
  });

  test('JSR/RTS preserve return path through stack', () => {
    const bus = new FlatMemoryBus();
    bus.load(0x8000, Uint8Array.from([0x20,0x06,0x80, 0xa9,0x42,0x00, 0xa9,0x11,0x60]));
    bus.write8(0xfffc,0x00); bus.write8(0xfffd,0x80);
    const cpu = new CPU6502(bus); cpu.reset();
    cpu.step(); eq(cpu.pc,0x8006); eq(cpu.sp,0xfb);
    cpu.step(); eq(cpu.a,0x11); cpu.step(); eq(cpu.pc,0x8003); eq(cpu.sp,0xfd);
    cpu.step(); eq(cpu.a,0x42);
  });

  test('Branch cycles account for taken and page-cross', () => {
    const bus = new FlatMemoryBus(); bus.load(0x80fd, Uint8Array.from([0xa9,0x01,0xd0,0xfe]));
    bus.write8(0xfffc,0xfd); bus.write8(0xfffd,0x80);
    const cpu = new CPU6502(bus); cpu.reset(); cpu.step();
    const spent = cpu.step(); eq(cpu.pc,0x80ff); eq(spent,4);
  });

  const passed = results.filter(r => r.ok).length;
  return { passed, failed: results.length - passed, total: results.length, results };
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('selftest.mjs')) {
  const report = runSelfTests();
  for (const r of report.results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n${r.error}`}`);
  console.log(`\n${report.passed}/${report.total} tests passed`);
  if (report.failed) process.exitCode = 1;
}
