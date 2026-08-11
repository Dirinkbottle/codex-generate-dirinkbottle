import { parseINES } from './ines.mjs';

function hashBytes(bytes, seed=0x811c9dc5){let h=seed>>>0;for(const b of bytes){h^=b;h=Math.imul(h,0x01000193)>>>0;}return h>>>0;}
function romIdentity(c){const h=hashBytes(c.raw??c.prgRom);return `${c.mapper}-${c.prgRom.length}-${c.chrRom.length}-${h.toString(16).padStart(8,'0')}`;}

class BaseCartridge {
  constructor(image, mapper, {traceHub=null,onIRQChange=null}={}) {
    const c=image?.format==='iNES'?image:parseINES(image);
    if(c.mapper!==mapper)throw new Error(`Mapper ${c.mapper} is not supported by mapper ${mapper} cartridge`);
    this.image=c;this.mapper=mapper;this.traceHub=traceHub;this.onIRQChange=onIRQChange;this.mirroring=c.mirroring;this.hasBattery=c.hasBattery;this.romId=romIdentity(c);
    this.prgRom=c.prgRom.slice();
    this.prgRam=new Uint8Array(Math.max(1,c.prgRamBanks??1)*0x2000);
    this.chrIsRam=c.chrRom.length===0;
    this.chr=this.chrIsRam?new Uint8Array(0x2000):c.chrRom.slice();
    if(c.trainer?.length)this.prgRam.set(c.trainer,0x1000);
  }
  cpuReadRam(a){return a>=0x6000&&a<=0x7fff?this.prgRam[(a-0x6000)%this.prgRam.length]:null;}
  cpuWriteRam(a,v){if(a>=0x6000&&a<=0x7fff){this.prgRam[(a-0x6000)%this.prgRam.length]=v&0xff;return true;}return false;}
  ppuRead(address){const a=address&0x3fff;return a<0x2000?this.chr[a%this.chr.length]:null;}
  ppuWrite(address,value){const a=address&0x3fff;if(a>=0x2000)return false;if(this.chrIsRam)this.chr[a%this.chr.length]=value&0xff;return true;}
  exportBatteryRAM(){return this.hasBattery?this.prgRam.slice():null;}
  importBatteryRAM(data){if(!this.hasBattery)return false;const bytes=data instanceof Uint8Array?data:new Uint8Array(data);if(bytes.length!==this.prgRam.length)throw new Error(`Battery RAM size mismatch: expected ${this.prgRam.length}, got ${bytes.length}`);this.prgRam.set(bytes);return true;}
  exportState(){return {mapper:this.mapper,romId:this.romId,mirroring:this.mirroring,prgRam:Array.from(this.prgRam),chrRam:this.chrIsRam?Array.from(this.chr):null};}
  importState(s){if(!s||s.mapper!==this.mapper||s.romId!==this.romId)throw new Error('Cartridge state does not match loaded ROM');if(s.prgRam)this.prgRam.set(s.prgRam);if(this.chrIsRam&&s.chrRam)this.chr.set(s.chrRam);if(s.mirroring)this.mirroring=s.mirroring;}
}

export class Mapper0Cartridge extends BaseCartridge {
  constructor(image,opts={}){super(image,0,opts);if(![0x4000,0x8000].includes(this.prgRom.length))throw new Error(`Mapper 0 requires 16KiB or 32KiB PRG ROM, got ${this.prgRom.length}`);if(![0,0x2000].includes(this.image.chrRom.length))throw new Error(`Mapper 0 requires 0 or 8KiB CHR, got ${this.image.chrRom.length}`);}
  cpuRead(address){const a=address&0xffff,ram=this.cpuReadRam(a);if(ram!==null)return ram;if(a>=0x8000)return this.prgRom[(a-0x8000)%this.prgRom.length];return null;}
  cpuWrite(address,value){const a=address&0xffff;if(this.cpuWriteRam(a,value))return true;return a>=0x8000;}
}

export class Mapper2Cartridge extends BaseCartridge {
  constructor(image,opts={}){super(image,2,opts);if(this.prgRom.length<0x8000||this.prgRom.length%0x4000)throw new Error('Mapper 2 requires PRG ROM in 16KiB banks');if(this.image.chrRom.length>0&&this.image.chrRom.length!==0x2000)throw new Error('Mapper 2 expects 8KiB CHR ROM or CHR RAM');this.prgBank=0;this.bankCount=this.prgRom.length/0x4000;}
  cpuRead(address){const a=address&0xffff,ram=this.cpuReadRam(a);if(ram!==null)return ram;if(a<0x8000)return null;const bank=a<0xc000?this.prgBank%this.bankCount:this.bankCount-1;return this.prgRom[bank*0x4000+(a&0x3fff)];}
  cpuWrite(address,value){const a=address&0xffff;if(this.cpuWriteRam(a,value))return true;if(a>=0x8000){this.prgBank=(value&0xff)%this.bankCount;this.traceHub?.emit('mapper',{type:'prg-bank',mapper:2,address:a,value:value&0xff,bank:this.prgBank});return true;}return false;}
  exportState(){return {...super.exportState(),prgBank:this.prgBank};}
  importState(s){super.importState(s);this.prgBank=s.prgBank%this.bankCount;}
}

export class Mapper3Cartridge extends BaseCartridge {
  constructor(image,opts={}){super(image,3,opts);if(![0x4000,0x8000].includes(this.prgRom.length))throw new Error('Mapper 3 requires 16KiB or 32KiB PRG ROM');if(this.image.chrRom.length===0||this.image.chrRom.length%0x2000)throw new Error('Mapper 3 requires CHR ROM in 8KiB banks');this.chrBank=0;this.chrBankCount=this.image.chrRom.length/0x2000;this.chr=this.image.chrRom.slice();this.chrIsRam=false;}
  cpuRead(address){const a=address&0xffff,ram=this.cpuReadRam(a);if(ram!==null)return ram;if(a>=0x8000)return this.prgRom[(a-0x8000)%this.prgRom.length];return null;}
  cpuWrite(address,value){const a=address&0xffff;if(this.cpuWriteRam(a,value))return true;if(a>=0x8000){this.chrBank=(value&0xff)%this.chrBankCount;this.traceHub?.emit('mapper',{type:'chr-bank',mapper:3,address:a,value:value&0xff,bank:this.chrBank});return true;}return false;}
  ppuRead(address){const a=address&0x3fff;return a<0x2000?this.chr[this.chrBank*0x2000+a]:null;}
  ppuWrite(address,value){return (address&0x3fff)<0x2000;}
  exportState(){return {...super.exportState(),chrBank:this.chrBank};}
  importState(s){super.importState(s);this.chrBank=s.chrBank%this.chrBankCount;}
}

export class Mapper1Cartridge extends BaseCartridge {
  constructor(image,opts={}){super(image,1,opts);if(this.prgRom.length<0x8000||this.prgRom.length%0x4000)throw new Error('MMC1 requires PRG ROM in 16KiB banks');if(this.image.chrRom.length>0&&this.image.chrRom.length%0x1000)throw new Error('MMC1 CHR ROM must be 4KiB aligned');this.prgBanks=this.prgRom.length/0x4000;this.chrBanks4k=this.chr.length/0x1000;this.shift=0x10;this.control=0x0c;this.chrBank0=0;this.chrBank1=0;this.prgBank=0;this.syncMirroring();}
  syncMirroring(){this.mirroring=['single0','single1','vertical','horizontal'][this.control&3];}
  commitRegister(address,value){const a=address&0xffff,v=value&0x1f;let register;if(a<0xa000){register='control';this.control=v;this.syncMirroring();}else if(a<0xc000){register='chr0';this.chrBank0=v;}else if(a<0xe000){register='chr1';this.chrBank1=v;}else{register='prg';this.prgBank=v;}this.traceHub?.emit('mapper',{type:'mmc1-commit',mapper:1,address:a,register,value:v,control:this.control,prgBank:this.prgBank,chrBank0:this.chrBank0,chrBank1:this.chrBank1,mirroring:this.mirroring});}
  serialWrite(address,value){if(value&0x80){this.shift=0x10;this.control|=0x0c;this.syncMirroring();this.traceHub?.emit('mapper',{type:'mmc1-reset',mapper:1,address:address&0xffff,control:this.control,mirroring:this.mirroring});return;}const before=this.shift,complete=this.shift&1;this.shift=(this.shift>>1)|((value&1)<<4);this.traceHub?.emit('mapper',{type:'mmc1-shift',mapper:1,address:address&0xffff,bit:value&1,before,after:this.shift,complete:!!complete});if(complete){this.commitRegister(address,this.shift);this.shift=0x10;}}
  prgRamEnabled(){return !(this.prgBank&0x10);}
  cpuRead(address){const a=address&0xffff;if(a>=0x6000&&a<=0x7fff)return this.prgRamEnabled()?this.prgRam[(a-0x6000)%this.prgRam.length]:0;if(a<0x8000)return null;const mode=(this.control>>2)&3,off=a&0x3fff;let bank;if(mode<=1){const base=(this.prgBank&0x0e)%this.prgBanks;bank=(base+(a>=0xc000?1:0))%this.prgBanks;}else if(mode===2)bank=a<0xc000?0:(this.prgBank&0x0f)%this.prgBanks;else bank=a<0xc000?(this.prgBank&0x0f)%this.prgBanks:this.prgBanks-1;return this.prgRom[bank*0x4000+off];}
  cpuWrite(address,value){const a=address&0xffff;if(a>=0x6000&&a<=0x7fff){if(this.prgRamEnabled())this.prgRam[(a-0x6000)%this.prgRam.length]=value&0xff;return true;}if(a>=0x8000){this.serialWrite(a,value&0xff);return true;}return false;}
  ppuRead(address){const a=address&0x3fff;if(a>=0x2000)return null;if(this.chrIsRam){const bank=this.mapChrBank(a);return this.chr[(bank*0x1000+(a&0x0fff))%this.chr.length];}const bank=this.mapChrBank(a);return this.chr[(bank*0x1000+(a&0x0fff))%this.chr.length];}
  ppuWrite(address,value){const a=address&0x3fff;if(a>=0x2000)return false;if(this.chrIsRam){const bank=this.mapChrBank(a);this.chr[(bank*0x1000+(a&0x0fff))%this.chr.length]=value&0xff;}return true;}
  mapChrBank(a){const mode=(this.control>>4)&1;if(!mode){const base=(this.chrBank0&0x1e)%this.chrBanks4k;return (base+(a>=0x1000?1:0))%this.chrBanks4k;}return (a<0x1000?this.chrBank0:this.chrBank1)%this.chrBanks4k;}
  exportState(){return {...super.exportState(),shift:this.shift,control:this.control,chrBank0:this.chrBank0,chrBank1:this.chrBank1,prgBank:this.prgBank};}
  importState(s){super.importState(s);this.shift=s.shift;this.control=s.control;this.chrBank0=s.chrBank0;this.chrBank1=s.chrBank1;this.prgBank=s.prgBank;this.syncMirroring();}
}

export class Mapper4Cartridge extends BaseCartridge {
  constructor(image,opts={}){
    super(image,4,opts);
    if(this.prgRom.length<0x4000||this.prgRom.length%0x2000)throw new Error('MMC3 requires at least 16KiB PRG ROM in 8KiB banks');
    if(this.image.chrRom.length>0&&this.image.chrRom.length%0x0400)throw new Error('MMC3 CHR ROM must be 1KiB aligned');
    this.prgBankCount=this.prgRom.length/0x2000;
    this.chrBankCount=this.chr.length/0x0400;
    this.fourScreen=this.image.mirroring==='four-screen';
    this.a12MinLowCycles=8;
    this.reset();
  }
  reset(){
    this.registers=new Uint8Array(8);this.bankSelect=0;this.prgMode=0;this.chrMode=0;
    this.prgRamEnabled=true;this.prgRamWriteProtected=false;
    this.irqLatch=0;this.irqCounter=0;this.irqReload=false;this.irqEnabled=false;this.irqAsserted=false;
    this.a12High=false;this.a12LowSince=null;this.a12QualifiedEdges=0;this.a12RejectedEdges=0;
    if(!this.fourScreen)this.mirroring=this.image.mirroring;
    this.onIRQChange?.(false);
  }
  emit(type,extra={}){this.traceHub?.emit('mapper',{type,mapper:4,...extra});}
  emitA12(type,extra={}){this.traceHub?.emit('mapperA12',{type,mapper:4,...extra});}
  setIrq(level,reason='state'){
    const next=!!level;if(next===this.irqAsserted)return;
    this.irqAsserted=next;this.emit(next?'irq-assert':'irq-clear',{reason,counter:this.irqCounter,latch:this.irqLatch});this.onIRQChange?.(next);
  }
  selectRegister(value){
    const oldPrg=this.prgMode,oldChr=this.chrMode;
    this.bankSelect=value&7;this.prgMode=(value>>6)&1;this.chrMode=(value>>7)&1;
    this.emit('mmc3-bank-select',{value:value&0xff,register:this.bankSelect,prgMode:this.prgMode,chrMode:this.chrMode,modeChanged:oldPrg!==this.prgMode||oldChr!==this.chrMode});
  }
  writeBankData(value){
    let v=value&0xff;if(this.bankSelect<=1)v&=0xfe;this.registers[this.bankSelect]=v;
    this.emit('mmc3-bank-data',{register:this.bankSelect,value:v,prgMode:this.prgMode,chrMode:this.chrMode,prgMap:this.prgMap(),chrMap:this.chrMap()});
  }
  prgMap(){
    // Some mapper-validation ROMs use a compact 16KiB image on an MMC3 devcart.
    // With only two physical 8KiB banks, expose the image twice across $8000-$FFFF.
    if(this.prgBankCount===2)return [0,1,0,1];
    const last=this.prgBankCount-1,last2=Math.max(0,last-1),r6=this.registers[6]%this.prgBankCount,r7=this.registers[7]%this.prgBankCount;
    return this.prgMode?[last2,r7,r6,last]:[r6,r7,last2,last];
  }
  chrMap(){
    const n=this.chrBankCount,mod=x=>((x%n)+n)%n,r=this.registers;
    const r0=mod(r[0]&0xfe),r1=mod(r[1]&0xfe);
    return this.chrMode?[mod(r[2]),mod(r[3]),mod(r[4]),mod(r[5]),r0,mod(r0+1),r1,mod(r1+1)]:[r0,mod(r0+1),r1,mod(r1+1),mod(r[2]),mod(r[3]),mod(r[4]),mod(r[5])];
  }
  cpuRead(address){
    const a=address&0xffff;
    if(a>=0x6000&&a<=0x7fff)return this.prgRamEnabled?this.prgRam[(a-0x6000)%this.prgRam.length]:0;
    if(a<0x8000)return null;
    const slot=(a-0x8000)>>13,bank=this.prgMap()[slot];return this.prgRom[bank*0x2000+(a&0x1fff)];
  }
  cpuWrite(address,value){
    const a=address&0xffff,v=value&0xff;
    if(a>=0x6000&&a<=0x7fff){if(this.prgRamEnabled&&!this.prgRamWriteProtected)this.prgRam[(a-0x6000)%this.prgRam.length]=v;return true;}
    if(a<0x8000)return false;
    switch(a&0xe001){
      case 0x8000:this.selectRegister(v);break;
      case 0x8001:this.writeBankData(v);break;
      case 0xa000:if(!this.fourScreen){this.mirroring=(v&1)?'horizontal':'vertical';this.emit('mmc3-mirroring',{value:v,mirroring:this.mirroring});}else this.emit('mmc3-mirroring-ignored',{value:v,mirroring:'four-screen'});break;
      case 0xa001:this.prgRamEnabled=!!(v&0x80);this.prgRamWriteProtected=!!(v&0x40);this.emit('mmc3-prg-ram',{value:v,enabled:this.prgRamEnabled,writeProtected:this.prgRamWriteProtected});break;
      case 0xc000:this.irqLatch=v;this.emit('mmc3-irq-latch',{value:v});break;
      case 0xc001:this.irqCounter=0;this.irqReload=true;this.emit('mmc3-irq-reload-request',{value:v});break;
      case 0xe000:this.irqEnabled=false;this.setIrq(false,'e000-disable');this.emit('mmc3-irq-disable');break;
      case 0xe001:this.irqEnabled=true;this.emit('mmc3-irq-enable');break;
    }
    return true;
  }
  ppuRead(address){const a=address&0x3fff;if(a>=0x2000)return null;const slot=a>>10,bank=this.chrMap()[slot];return this.chr[bank*0x0400+(a&0x03ff)];}
  ppuWrite(address,value){const a=address&0x3fff;if(a>=0x2000)return false;if(this.chrIsRam){const slot=a>>10,bank=this.chrMap()[slot];this.chr[bank*0x0400+(a&0x03ff)]=value&0xff;}return true;}
  clockIrq(ppuCycle,source,address,lowCycles){
    const before=this.irqCounter,reload=this.irqReload;
    if(this.irqCounter===0||this.irqReload)this.irqCounter=this.irqLatch;else this.irqCounter=(this.irqCounter-1)&0xff;
    this.irqReload=false;this.a12QualifiedEdges++;
    this.emit('mmc3-irq-clock',{ppuCycle,source,address:address&0x3fff,lowCycles,before,after:this.irqCounter,latch:this.irqLatch,reload,enabled:this.irqEnabled});
    if(this.irqCounter===0&&this.irqEnabled)this.setIrq(true,'a12-counter-zero');
  }
  observePpuAddress(address,ppuCycle=0,source='ppu'){
    const a=address&0x3fff;if(a>=0x3f00)return;
    const high=!!(a&0x1000),cycle=Number(ppuCycle)||0;
    if(!high){
      if(this.a12High||this.a12LowSince==null){this.a12LowSince=cycle;this.emitA12('a12-fall',{ppuCycle:cycle,address:a,source});}
      this.a12High=false;return;
    }
    if(!this.a12High){
      const lowCycles=this.a12LowSince==null?0:Math.max(0,cycle-this.a12LowSince);
      if(this.a12LowSince!=null&&lowCycles>=this.a12MinLowCycles){this.emitA12('a12-rise-qualified',{ppuCycle:cycle,address:a,source,lowCycles});this.clockIrq(cycle,source,a,lowCycles);}
      else{this.a12RejectedEdges++;this.emitA12('a12-rise-rejected',{ppuCycle:cycle,address:a,source,lowCycles});}
    }
    this.a12High=true;this.a12LowSince=null;
  }
  debugState(){return {mapper:4,bankSelect:this.bankSelect,prgMode:this.prgMode,chrMode:this.chrMode,registers:Array.from(this.registers),prgMap:this.prgMap(),chrMap:this.chrMap(),prgRamEnabled:this.prgRamEnabled,prgRamWriteProtected:this.prgRamWriteProtected,irqLatch:this.irqLatch,irqCounter:this.irqCounter,irqReload:this.irqReload,irqEnabled:this.irqEnabled,irqAsserted:this.irqAsserted,a12QualifiedEdges:this.a12QualifiedEdges,a12RejectedEdges:this.a12RejectedEdges};}
  exportState(){return {...super.exportState(),registers:Array.from(this.registers),bankSelect:this.bankSelect,prgMode:this.prgMode,chrMode:this.chrMode,prgRamEnabled:this.prgRamEnabled,prgRamWriteProtected:this.prgRamWriteProtected,irqLatch:this.irqLatch,irqCounter:this.irqCounter,irqReload:this.irqReload,irqEnabled:this.irqEnabled,irqAsserted:this.irqAsserted,a12High:this.a12High,a12LowSince:this.a12LowSince,a12QualifiedEdges:this.a12QualifiedEdges,a12RejectedEdges:this.a12RejectedEdges};}
  importState(s){super.importState(s);this.registers.set(s.registers);this.bankSelect=s.bankSelect;this.prgMode=s.prgMode;this.chrMode=s.chrMode;this.prgRamEnabled=!!s.prgRamEnabled;this.prgRamWriteProtected=!!s.prgRamWriteProtected;this.irqLatch=s.irqLatch&0xff;this.irqCounter=s.irqCounter&0xff;this.irqReload=!!s.irqReload;this.irqEnabled=!!s.irqEnabled;this.irqAsserted=!!s.irqAsserted;this.a12High=!!s.a12High;this.a12LowSince=s.a12LowSince??null;this.a12QualifiedEdges=s.a12QualifiedEdges|0;this.a12RejectedEdges=s.a12RejectedEdges|0;this.onIRQChange?.(this.irqAsserted);}
}

export function createCartridge(input,opts={}){const parsed=input?.format==='iNES'?input:parseINES(input);switch(parsed.mapper){case 0:return new Mapper0Cartridge(parsed,opts);case 1:return new Mapper1Cartridge(parsed,opts);case 2:return new Mapper2Cartridge(parsed,opts);case 3:return new Mapper3Cartridge(parsed,opts);case 4:return new Mapper4Cartridge(parsed,opts);default:throw new Error(`Unsupported mapper ${parsed.mapper}; supported: 0 NROM, 1 MMC1, 2 UxROM, 3 CNROM, 4 MMC3`);}}
