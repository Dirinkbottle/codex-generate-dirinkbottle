import { TraceHub, WatchpointSet } from './debug.mjs';
import { parseINES } from './ines.mjs';
import { createCartridge } from './cartridge.mjs';
import { PPUMemoryBus } from './ppubus.mjs';
import { PPU2C02 } from './ppu.mjs';
import { NESBus, APUIOStub } from './nesbus.mjs';
import { CPU6502 } from './cpu6502.mjs';

export class NESMachine {
  constructor({ traceCapacities = {} } = {}) {
    this.traceHub = new TraceHub({ capacities: traceCapacities });
    this.trace = this.traceHub.channel('cpu');
    this.watchpoints = new WatchpointSet();
    this.loaded = false;
  }
  loadROM(input) {
    this.parsed=parseINES(input);this.cartridge=createCartridge(this.parsed);
    this.ppuBus=new PPUMemoryBus({cartridge:this.cartridge,traceHub:this.traceHub});
    this.ppu=new PPU2C02({bus:this.ppuBus,traceHub:this.traceHub,onNMI:()=>this.cpu?.requestNMI()});
    this.apuIo=new APUIOStub();
    this.bus=new NESBus({cartridge:this.cartridge,ppu:this.ppu,apuIo:this.apuIo,watchpoints:this.watchpoints,traceHub:this.traceHub});
    this.traceHub.clear();
    this.cpu=new CPU6502(this.bus,{trace:this.trace});
    this.cpu.reset();this.loaded=true;return this.snapshot();
  }
  ensureLoaded(){if(!this.loaded)throw new Error('No ROM loaded');}
  reset(){this.ensureLoaded();this.traceHub.clear();this.bus.clearBreak();this.ppu.reset();this.cpu.reset();return this.snapshot();}
  step(count=1){
    this.ensureLoaded();if(!Number.isInteger(count)||count<1||count>1_000_000)throw new Error('step count must be 1..1,000,000');
    let executed=0,cpuCycles=0,ppuCycles=0;
    while(executed<count){const spent=this.cpu.step();this.ppu.runCycles(spent*3);cpuCycles+=spent;ppuCycles+=spent*3;executed++;if(this.bus.breakReason)break;}
    return {executed,spent:cpuCycles,cpuCycles,ppuCycles,breakReason:this.bus.breakReason,snapshot:this.snapshot()};
  }
  runFrame({maxInstructions=100000}={}){
    this.ensureLoaded();const target=this.ppu.frame+1;let executed=0,cpuCycles=0;
    while(this.ppu.frame<target){if(executed>=maxInstructions)throw new Error(`frame instruction guard tripped at PC $${this.cpu.pc.toString(16).padStart(4,'0')}`);const spent=this.cpu.step();this.ppu.runCycles(spent*3);cpuCycles+=spent;executed++;if(this.bus.breakReason)break;}
    return {executed,cpuCycles,ppuCycles:cpuCycles*3,frame:this.ppu.frame,breakReason:this.bus.breakReason,snapshot:this.snapshot()};
  }
  snapshot(){this.ensureLoaded();return {mapper:this.cartridge.mapper,mirroring:this.cartridge.mirroring,chrIsRam:this.cartridge.chrIsRam,cpu:this.cpu.snapshot(),ppu:this.ppu.snapshot(),breakReason:this.bus.breakReason};}
}
