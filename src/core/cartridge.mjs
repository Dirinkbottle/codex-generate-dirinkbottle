import { parseINES } from './ines.mjs';

function hashBytes(bytes, seed=0x811c9dc5){let h=seed>>>0;for(const b of bytes){h^=b;h=Math.imul(h,0x01000193)>>>0;}return h>>>0;}
function romIdentity(c){const h=hashBytes(c.raw??c.prgRom);return `${c.mapper}-${c.prgRom.length}-${c.chrRom.length}-${h.toString(16).padStart(8,'0')}`;}

class BaseCartridge {
  constructor(image, mapper, {traceHub=null}={}) {
    const c=image?.format==='iNES'?image:parseINES(image);
    if(c.mapper!==mapper)throw new Error(`Mapper ${c.mapper} is not supported by mapper ${mapper} cartridge`);
    this.image=c;this.mapper=mapper;this.traceHub=traceHub;this.mirroring=c.mirroring;this.hasBattery=c.hasBattery;this.romId=romIdentity(c);
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

export function createCartridge(input,opts={}){const parsed=input?.format==='iNES'?input:parseINES(input);switch(parsed.mapper){case 0:return new Mapper0Cartridge(parsed,opts);case 1:return new Mapper1Cartridge(parsed,opts);case 2:return new Mapper2Cartridge(parsed,opts);case 3:return new Mapper3Cartridge(parsed,opts);default:throw new Error(`Unsupported mapper ${parsed.mapper}; supported: 0 NROM, 1 MMC1, 2 UxROM, 3 CNROM`);}}
