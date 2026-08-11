export class PPUMemoryBus {
  constructor({ cartridge = null, mirroring = null, traceHub = null } = {}) {
    this.cartridge=cartridge;this.mirroringOverride=mirroring;this.traceHub=traceHub;
    this.ciram=new Uint8Array((mirroring??cartridge?.mirroring)==='four-screen'?0x1000:0x800);
    this.palette=new Uint8Array(0x20);
  }
  get mirroring(){return this.mirroringOverride??this.cartridge?.mirroring??'horizontal';}
  set mirroring(v){this.mirroringOverride=v;}
  setCartridge(cartridge){this.cartridge=cartridge;if(this.mirroring==='four-screen'&&this.ciram.length!==0x1000)this.ciram=new Uint8Array(0x1000);}
  normalize(address){return address&0x3fff;}
  nametableIndex(address){let a=address&0x3fff;if(a>=0x3000&&a<0x3f00)a-=0x1000;const logical=(a-0x2000)&0x0fff,table=logical>>10,off=logical&0x3ff,m=this.mirroring;if(m==='four-screen')return logical;if(m==='single0')return off;if(m==='single1')return 0x400|off;const physical=m==='vertical'?(table&1):(table>>1);return (physical<<10)|off;}
  paletteIndex(address){let i=(address-0x3f00)&0x1f;if(i===0x10||i===0x14||i===0x18||i===0x1c)i-=0x10;return i;}
  read8(address,source='ppu'){const a=this.normalize(address);let value=0,device='open';if(a<0x2000){value=this.cartridge?.ppuRead(a)??0;device='chr';}else if(a<0x3f00){value=this.ciram[this.nametableIndex(a)];device='ciram';}else{value=this.palette[this.paletteIndex(a)];device='palette';}value&=0xff;this.traceHub?.emit('ppuMem',{kind:'r',address:a,value,device,source});return value;}
  write8(address,value,source='ppu'){const a=this.normalize(address),v=value&0xff;let device='open';if(a<0x2000){this.cartridge?.ppuWrite(a,v);device='chr';}else if(a<0x3f00){this.ciram[this.nametableIndex(a)]=v;device='ciram';}else{this.palette[this.paletteIndex(a)]=v&0x3f;device='palette';}this.traceHub?.emit('ppuMem',{kind:'w',address:a,value:v,device,source});}
}
