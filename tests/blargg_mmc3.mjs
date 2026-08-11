import { readFileSync } from 'node:fs';
import { NESMachine } from '../src/core/machine.mjs';

const path=process.argv[2];
if(!path)throw new Error('usage: node tests/blargg_mmc3.mjs <rom.nes>');
const bytes=new Uint8Array(readFileSync(path));
const m=new NESMachine({traceCapacities:{cpu:256,cpuMem:512,ppuReg:1024,mapper:2048,mapperA12:2048,timeline:1024}});
m.loadROM(bytes);
for(const ch of ['ppuMem','audioSample','apuReg','apuEvent','controller','dma'])m.traceHub.enable(ch,false);
m.traceHub.enable('mapperA12',true);

const maxInstructions=4_000_000;
let lastPc=-1,samePc=0;
for(let i=0;i<maxInstructions;i++){
  m.scheduler.stepInstruction();
  const result=m.bus.ram[0x00f8];
  if(result===1){
    console.log(`PASS blargg ${path}: result=$01 after ${i+1} instructions, cpuCycle=${m.scheduler.cpuCycle}, A12=${m.cartridge.a12QualifiedEdges??0} qualified/${m.cartridge.a12RejectedEdges??0} rejected`);
    process.exit(0);
  }
  if(m.cpu.pc===lastPc)samePc++;else samePc=0;
  lastPc=m.cpu.pc;
  if(samePc>=64&&result!==0){
    console.error(`FAIL blargg ${path}: result=$${result.toString(16).padStart(2,'0')} at PC=$${m.cpu.pc.toString(16).padStart(4,'0')} cpuCycle=${m.scheduler.cpuCycle}`);
    for(const ch of ['mapper','mapperA12','ppuReg','timeline']){
      console.error(`--- ${ch} tail ---`);
      for(const e of m.traceHub.tail(ch,24))console.error(JSON.stringify(e));
    }
    process.exit(1);
  }
}
console.error(`TIMEOUT blargg ${path}: result=$${m.bus.ram[0xf8].toString(16).padStart(2,'0')} PC=$${m.cpu.pc.toString(16).padStart(4,'0')} cpuCycle=${m.scheduler.cpuCycle}`);
process.exit(2);
