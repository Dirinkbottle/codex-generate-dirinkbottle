import { strict as assert } from 'node:assert';
import { NESMachine } from '../src/core/machine.mjs';
import { makeINES, setResetVector, setPrg } from './romfactory.mjs';

let passed=0;const test=(name,fn)=>{fn();console.log(`PASS ${name}`);passed++;};
function tinyRom(){const r=setResetVector(makeINES({mapper:0,prgBanks:1,chrBanks:0}),0x8000);setPrg(r,0,0,Uint8Array.from([0xea,0x4c,0x00,0x80]));return r.bytes;}

test('production NESMachine detaches tracing from every hot device path',()=>{const m=new NESMachine();assert.equal(m.traceHub,null);assert.equal(m.trace,null);m.loadROM(tinyRom());assert.equal(m.cpu.trace,null);assert.equal(m.ppu.traceHub,null);assert.equal(m.ppuBus.traceHub,null);assert.equal(m.apu.traceHub,null);assert.equal(m.bus.traceHub,null);assert.equal(m.scheduler.traceHub,null);m.step(100);assert.equal(m.cpu.pc,0x8000);});

test('developmentTracing explicitly restores CPU and device observability',()=>{const m=new NESMachine({developmentTracing:true});assert.ok(m.traceHub);assert.ok(m.trace);m.loadROM(tinyRom());m.step(2);assert.ok(m.trace.tail(2).length>0);assert.ok(m.traceHub.snapshot('cpuMem').length>0);});

console.log(`\n${passed}/2 P6 fast-path tests passed`);
