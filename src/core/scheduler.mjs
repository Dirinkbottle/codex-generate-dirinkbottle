export class MasterClock {
  constructor({cpu,ppu,apu,bus,controllers=null,inputTimeline=null,traceHub=null,startCpuCycle=0}={}){this.cpu=cpu;this.ppu=ppu;this.apu=apu;this.bus=bus;this.controllers=controllers;this.inputTimeline=inputTimeline;this.traceHub=traceHub;this.cpuCycle=startCpuCycle|0;this.totalStallCycles=0;}
  emit(type,extra={}){this.traceHub?.emit('timeline',{type,cpuCycle:this.cpuCycle,ppuFrame:this.ppu?.frame,ppuScanline:this.ppu?.scanline,ppuDot:this.ppu?.dot,...extra});}
  advanceOne(owner='cpu'){if(owner!=='cpu'&&owner!=='reset')this.traceHub?.emit('timeline',{type:'bus-owner',cpuCycle:this.cpuCycle,owner});this.apu?.tick();this.ppu?.runCycles(3);this.cpuCycle++;this.inputTimeline?.applyUntil(this.cpuCycle,this.controllers);}
  advanceCycles(n,owner='cpu'){for(let i=0;i<n;i++)this.advanceOne(owner);}
  serviceOamDma(page){const odd=this.cpuCycle&1,total=513+odd;this.traceHub?.emit('dma',{type:'oam-begin',cpuCycle:this.cpuCycle,page:page&0xff,totalCycles:total});this.advanceOne('oam-halt');if(odd)this.advanceOne('oam-align');for(let i=0;i<256;i++){const address=((page&0xff)<<8)|i;const value=this.bus.read8(address,'oam-dma');this.traceHub?.emit('dma',{type:'oam-read',cpuCycle:this.cpuCycle,address,value,index:i});this.advanceOne('oam-read');if(this.ppu.dmaWrite)this.ppu.dmaWrite(value);else if(this.ppu.cpuWrite)this.ppu.cpuWrite(0x2004,value);else{this.ppu.oam[this.ppu.oamAddr]=value;this.ppu.oamAddr=(this.ppu.oamAddr+1)&255;}this.traceHub?.emit('dma',{type:'oam-write',cpuCycle:this.cpuCycle,index:i,value,oamAddr:this.ppu.oamAddr});this.advanceOne('oam-write');}this.totalStallCycles+=total;this.traceHub?.emit('dma',{type:'oam-end',cpuCycle:this.cpuCycle,page:page&0xff,totalCycles:total});return total;}
  serviceDmcDma(request){const address=request.address&0xffff,start=this.cpuCycle;this.traceHub?.emit('dma',{type:'dmc-begin',cpuCycle:start,address});this.advanceOne('dmc-halt');this.advanceOne('dmc-dummy');const value=this.bus.read8(address,'dmc-dma');this.traceHub?.emit('dma',{type:'dmc-read',cpuCycle:this.cpuCycle,address,value});this.advanceOne('dmc-read');this.apu.supplyDmcByte(value);this.advanceOne('dmc-tail');this.totalStallCycles+=4;this.traceHub?.emit('dma',{type:'dmc-end',cpuCycle:this.cpuCycle,address,value,totalCycles:4});return 4;}
  drainPendingDma(){let stalls=0;const page=this.bus.takeOamDmaRequest?.();if(page!=null)stalls+=this.serviceOamDma(page);let guard=0;for(;;){const r=this.apu?.takeDmcDmaRequest?.();if(!r)break;stalls+=this.serviceDmcDma(r);if(++guard>64)throw new Error('DMC DMA guard tripped');}return stalls;}
  stepInstruction(){
    const pc=this.cpu.pc,pollMasked=!!(this.cpu.p&0x04),spent=this.cpu.step(),interrupt=!!this.cpu.lastStepWasInterrupt;
    for(let i=0;i<spent;i++){
      this.advanceOne('cpu');
      // NMOS 6502 polls maskable IRQ near the end of the instruction. Keep the physical
      // line separate from the sampled request so a late edge waits one more instruction.
      if(i===Math.max(0,spent-2))this.cpu.sampleIRQ?.(interrupt?true:pollMasked);
    }
    const stalls=this.drainPendingDma();if(stalls)this.emit('cpu-stalled',{pc,nextPC:this.cpu.pc,instructionCycles:spent,stallCycles:stalls});return {instructionCycles:spent,stallCycles:stalls,totalCycles:spent+stalls};
  }
  step(count=1){let executed=0,cpuCycles=0,stallCycles=0;while(executed<count){const r=this.stepInstruction();cpuCycles+=r.totalCycles;stallCycles+=r.stallCycles;executed++;if(this.bus.breakReason)break;}return {executed,cpuCycles,stallCycles,ppuCycles:cpuCycles*3};}
  runFrame({maxInstructions=100000}={}){const target=this.ppu.frame+1;this.emit('frame-run-begin',{targetFrame:target});let executed=0,cpuCycles=0,stallCycles=0;while(this.ppu.frame<target){if(executed>=maxInstructions)throw new Error('frame instruction guard tripped');const r=this.stepInstruction();executed++;cpuCycles+=r.totalCycles;stallCycles+=r.stallCycles;if(this.bus.breakReason)break;}const out={executed,cpuCycles,stallCycles,ppuCycles:cpuCycles*3,frame:this.ppu.frame};this.emit('frame-run-end',out);return out;}
  snapshot(){return {cpuCycle:this.cpuCycle,totalStallCycles:this.totalStallCycles};}
}
