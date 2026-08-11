import { TraceHub, WatchpointSet } from './debug.mjs';
import { parseINES } from './ines.mjs';
import { createCartridge } from './cartridge.mjs';
import { PPUMemoryBus } from './ppubus.mjs';
import { PPU2C02 } from './ppu.mjs';
import { NESBus } from './nesbus.mjs';
import { CPU2A03 } from './cpu2a03.mjs';
import { ControllerPorts, InputTimeline } from './controller.mjs';
import { APU2A03 } from './apu.mjs';
import { MasterClock } from './scheduler.mjs';
import { captureMutable, restoreMutable } from './state.mjs';

export class NESMachine {
  constructor({traceCapacities={}}={}){
    this.traceHub=new TraceHub({capacities:traceCapacities});
    this.trace=this.traceHub.channel('cpu');
    this.watchpoints=new WatchpointSet();
    this.loaded=false;
  }
  loadROM(input){
    this.cpu=null;this.scheduler=null;this.traceHub.setClock(()=>this.scheduler?.cpuCycle??0);
    this.parsed=parseINES(input);this.cartridge=createCartridge(this.parsed,{traceHub:this.traceHub});
    this.ppuBus=new PPUMemoryBus({cartridge:this.cartridge,traceHub:this.traceHub});
    this.ppu=new PPU2C02({bus:this.ppuBus,traceHub:this.traceHub,onNMI:()=>this.cpu?.requestNMI()});
    this.controllers=new ControllerPorts({traceHub:this.traceHub,cycle:()=>this.scheduler?.cpuCycle??0});
    this.inputTimeline=new InputTimeline({traceHub:this.traceHub});
    this.apu=new APU2A03({traceHub:this.traceHub,cycle:()=>this.scheduler?.cpuCycle??0,onIRQChange:line=>this.cpu?.setIRQ(line)});
    this.bus=new NESBus({cartridge:this.cartridge,ppu:this.ppu,apu:this.apu,controllers:this.controllers,watchpoints:this.watchpoints,traceHub:this.traceHub});
    this.traceHub.clear();
    this.cpu=new CPU2A03(this.bus,{trace:this.trace});
    this.cpu.reset();
    this.scheduler=new MasterClock({cpu:this.cpu,ppu:this.ppu,apu:this.apu,bus:this.bus,controllers:this.controllers,inputTimeline:this.inputTimeline,traceHub:this.traceHub,startCpuCycle:0});
    this.traceHub.setClock(()=>this.scheduler?.cpuCycle??0);
    this.scheduler.advanceCycles(this.cpu.cycles,'reset');
    this.loaded=true;return this.snapshot();
  }
  ensureLoaded(){if(!this.loaded)throw new Error('No ROM loaded');}
  reset(){
    this.ensureLoaded();this.traceHub.clear();this.bus.clearBreak();this.bus.oamDmaPage=null;this.ppu.reset();this.apu.reset();this.cpu.reset();
    this.scheduler=new MasterClock({cpu:this.cpu,ppu:this.ppu,apu:this.apu,bus:this.bus,controllers:this.controllers,inputTimeline:this.inputTimeline,traceHub:this.traceHub,startCpuCycle:0});
    this.traceHub.setClock(()=>this.scheduler.cpuCycle);this.scheduler.advanceCycles(this.cpu.cycles,'reset');return this.snapshot();
  }
  step(count=1){this.ensureLoaded();if(!Number.isInteger(count)||count<1||count>1_000_000)throw new Error('step count must be 1..1,000,000');return {...this.scheduler.step(count),breakReason:this.bus.breakReason,snapshot:this.snapshot()};}
  runFrame(options={}){this.ensureLoaded();return {...this.scheduler.runFrame(options),breakReason:this.bus.breakReason,snapshot:this.snapshot()};}
  setController(port,state){this.ensureLoaded();const mask=this.controllers.setButtons(port,state);this.inputTimeline.record(this.scheduler.cpuCycle,port,mask);return mask;}
  beginInputRecord(){this.ensureLoaded();this.inputTimeline.beginRecord();}
  stopInputRecord(){this.ensureLoaded();return this.inputTimeline.stop();}
  beginInputReplay(events){this.ensureLoaded();this.inputTimeline.beginReplay(events);}
  drainAudio(){this.ensureLoaded();return this.apu.drainSamples();}
  exportBatteryRAM(){this.ensureLoaded();return this.cartridge.exportBatteryRAM?.()??null;}
  importBatteryRAM(data){this.ensureLoaded();return this.cartridge.importBatteryRAM?.(data)??false;}
  saveState(){
    this.ensureLoaded();
    return {
      version:1,romId:this.cartridge.romId,mapper:this.cartridge.mapper,
      cartridge:this.cartridge.exportState(),
      cpu:captureMutable(this.cpu,{skip:['bus','trace']}),
      cpuBus:captureMutable(this.bus,{skip:['cartridge','ppu','apu','controllers','watchpoints','traceHub']}),
      ppu:captureMutable(this.ppu,{skip:['bus','traceHub','onNMI']}),
      ppuBus:captureMutable(this.ppuBus,{skip:['cartridge','traceHub','mirroringOverride']}),
      apu:captureMutable(this.apu,{skip:['traceHub','cycleProvider','onIRQChange','onIrq']}),
      controllers:captureMutable(this.controllers,{skip:['traceHub','cycle']}),
      inputTimeline:captureMutable(this.inputTimeline,{skip:['traceHub']}),
      clock:{cpuCycle:this.scheduler.cpuCycle,totalStallCycles:this.scheduler.totalStallCycles}
    };
  }
  loadState(state){
    this.ensureLoaded();
    if(!state||state.version!==1)throw new Error('Unsupported save-state version');
    if(state.romId!==this.cartridge.romId||state.mapper!==this.cartridge.mapper)throw new Error('Save state belongs to a different ROM');
    this.cartridge.importState(state.cartridge);
    restoreMutable(this.cpu,state.cpu,{skip:['bus','trace']});
    restoreMutable(this.bus,state.cpuBus,{skip:['cartridge','ppu','apu','controllers','watchpoints','traceHub']});
    restoreMutable(this.ppu,state.ppu,{skip:['bus','traceHub','onNMI']});
    restoreMutable(this.ppuBus,state.ppuBus,{skip:['cartridge','traceHub','mirroringOverride']});
    restoreMutable(this.apu,state.apu,{skip:['traceHub','cycleProvider','onIRQChange','onIrq']});
    restoreMutable(this.controllers,state.controllers,{skip:['traceHub','cycle']});
    restoreMutable(this.inputTimeline,state.inputTimeline,{skip:['traceHub']});
    this.scheduler.cpuCycle=state.clock.cpuCycle|0;this.scheduler.totalStallCycles=state.clock.totalStallCycles|0;
    this.traceHub.clear();this.traceHub.emit('timeline',{type:'state-load',cpuCycle:this.scheduler.cpuCycle,romId:this.cartridge.romId});
    return this.snapshot();
  }
  snapshot(){
    this.ensureLoaded();return {romId:this.cartridge.romId,mapper:this.cartridge.mapper,mirroring:this.cartridge.mirroring,hasBattery:this.cartridge.hasBattery,chrIsRam:this.cartridge.chrIsRam,cpu:this.cpu.snapshot(),ppu:this.ppu.snapshot(),apu:this.apu.snapshot(),controllers:this.controllers.snapshot(),clock:this.scheduler.snapshot(),breakReason:this.bus.breakReason};
  }
}
