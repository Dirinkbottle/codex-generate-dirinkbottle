import { WatchpointSet } from './debug.mjs';

export class PPURegisterStub {
  constructor() { this.registers = new Uint8Array(8); this.accessLog = []; }
  cpuRead(address) { const r=address&7,value=this.registers[r];this.accessLog.push({kind:'r',address:0x2000|r,value});return value; }
  cpuWrite(address,value) { const r=address&7,v=value&0xff;this.registers[r]=v;this.accessLog.push({kind:'w',address:0x2000|r,value:v}); }
}

export class APUIOStub {
  constructor() { this.registers=new Uint8Array(0x20);this.accessLog=[]; }
  cpuRead(address){const a=address&0xffff,value=this.registers[a-0x4000]??0;this.accessLog.push({kind:'r',address:a,value});return value;}
  cpuWrite(address,value){const a=address&0xffff,v=value&0xff;if(a<0x4020)this.registers[a-0x4000]=v;this.accessLog.push({kind:'w',address:a,value:v});}
}

export class NESBus {
  constructor({ cartridge=null, ppu=new PPURegisterStub(), apuIo=new APUIOStub(), watchpoints=new WatchpointSet(), traceHub=null }={}) {
    this.ram=new Uint8Array(0x800);this.cartridge=cartridge;this.ppu=ppu;this.apuIo=apuIo;this.watchpoints=watchpoints;this.traceHub=traceHub;this.breakReason=null;this.openBus=0;
  }
  attachCartridge(cartridge){this.cartridge=cartridge;return this;}
  clearBreak(){this.breakReason=null;}
  trace(kind,address,mappedAddress,value,device,source){this.traceHub?.emit('cpuMem',{kind,address:address&0xffff,mappedAddress:mappedAddress&0xffff,value:value&0xff,device,source});}
  read8(address,source='cpu'){
    const a=address&0xffff;let value,mapped=a,device='open';
    if(a<0x2000){mapped=a&0x07ff;value=this.ram[mapped];device='ram';}
    else if(a<0x4000){mapped=0x2000|(a&7);value=this.ppu.cpuRead(mapped);device='ppu-reg';}
    else if(a<0x4020){value=this.apuIo.cpuRead(a);device='apu-io';}
    else{const v=this.cartridge?.cpuRead(a);value=v==null?this.openBus:v;device=v==null?'open':'cartridge';}
    this.openBus=value&0xff;this.trace('r',a,mapped,this.openBus,device,source);
    if(this.watchpoints.match(a,'r'))this.breakReason={type:'watchpoint',access:'r',address:a,mappedAddress:mapped,value:this.openBus,device,source};
    return this.openBus;
  }
  write8(address,value,source='cpu'){
    const a=address&0xffff,v=value&0xff;let mapped=a,device='open';this.openBus=v;
    if(a<0x2000){mapped=a&0x07ff;this.ram[mapped]=v;device='ram';}
    else if(a<0x4000){mapped=0x2000|(a&7);this.ppu.cpuWrite(mapped,v);device='ppu-reg';}
    else if(a<0x4020){this.apuIo.cpuWrite(a,v);device='apu-io';}
    else{device=this.cartridge?.cpuWrite(a,v)?'cartridge':'open';}
    this.trace('w',a,mapped,v,device,source);
    if(this.watchpoints.match(a,'w'))this.breakReason={type:'watchpoint',access:'w',address:a,mappedAddress:mapped,value:v,device,source};
  }
  read16(address,source='cpu'){const a=address&0xffff;return this.read8(a,source)|(this.read8((a+1)&0xffff,source)<<8);}
}
