import { PPUMemoryBus } from './ppubus.mjs';

export const NES_RGB = Object.freeze([
  0x626262,0x001fb2,0x2404c8,0x5200b2,0x730076,0x800024,0x730b00,0x522800,0x244400,0x005700,0x005c00,0x005324,0x003c76,0x000000,0x000000,0x000000,
  0xababab,0x0d57ff,0x4b30ff,0x8a13ff,0xbc08d6,0xd21269,0xc72e00,0x9d5400,0x607b00,0x209800,0x00a300,0x009942,0x007db4,0x000000,0x000000,0x000000,
  0xffffff,0x53aeff,0x9085ff,0xd365ff,0xff57ff,0xff5dcf,0xff7757,0xfa9e00,0xbdc700,0x7ae700,0x43f611,0x26ef7e,0x2cd5f6,0x4e4e4e,0x000000,0x000000,
  0xffffff,0xb6e1ff,0xced1ff,0xe9c3ff,0xffbcff,0xffbdf4,0xffc6c3,0xffd59a,0xe9e681,0xcef481,0xb6f9a0,0xa9f5ce,0xaaf0f9,0xb8b8b8,0x000000,0x000000
]);

export class PPU2C02 {
  constructor({ bus = null, cartridge = null, traceHub = null, onNMI = null } = {}) {
    this.traceHub = traceHub;
    this.bus = bus ?? new PPUMemoryBus({ cartridge, traceHub });
    this.onNMI = onNMI;
    this.framebuffer = new Uint8ClampedArray(256*240*4);
    this.oam = new Uint8Array(256);
    this.reset();
  }
  reset() {
    this.ctrl=0; this.mask=0; this.status=0; this.oamAddr=0; this.openBus=0;
    this.v=0; this.t=0; this.fineX=0; this.w=false; this.readBuffer=0;
    this.scanline=261; this.dot=0; this.frame=0; this.oddFrame=false; this.nmiLine=false;
    this.bgNextTileId=0; this.bgNextTileAttr=0; this.bgNextTileLo=0; this.bgNextTileHi=0;
    this.bgPatternLo=0; this.bgPatternHi=0; this.bgAttrLo=0; this.bgAttrHi=0;
    this.scanlineSprites=[];
    this.framebuffer.fill(0); for(let i=3;i<this.framebuffer.length;i+=4)this.framebuffer[i]=255;
  }
  renderingEnabled(){return !!(this.mask&0x18)}
  backgroundEnabled(){return !!(this.mask&0x08)}
  spritesEnabled(){return !!(this.mask&0x10)}
  emitEvent(type, extra={}){this.traceHub?.emit('ppuEvent',{type,frame:this.frame,scanline:this.scanline,dot:this.dot,...extra})}
  regTrace(kind,reg,value,extra={}){this.traceHub?.emit('ppuReg',{kind,address:0x2000|(reg&7),register:reg&7,value:value&0xff,frame:this.frame,scanline:this.scanline,dot:this.dot,v:this.v,t:this.t,x:this.fineX,w:this.w,...extra})}
  updateNMILine(reason='state'){
    const line=!!(this.ctrl&0x80)&&!!(this.status&0x80);
    if(line&&!this.nmiLine){this.emitEvent('nmi-edge',{reason});this.onNMI?.();}
    this.nmiLine=line;
  }
  cpuRead(address){
    const reg=address&7; let value=this.openBus;
    switch(reg){
      case 2:
        value=(this.status&0xe0)|(this.openBus&0x1f);
        this.status&=~0x80; this.w=false; this.updateNMILine('status-read');
        break;
      case 4: value=this.oam[this.oamAddr]; break;
      case 7:{
        const a=this.v&0x3fff;
        if(a<0x3f00){value=this.readBuffer;this.readBuffer=this.bus.read8(a,'cpu-ppudata-fill');}
        else {value=this.bus.read8(a,'cpu-ppudata-palette');this.readBuffer=this.bus.read8((a-0x1000)&0x3fff,'cpu-ppudata-buffer');}
        this.v=(this.v+((this.ctrl&4)?32:1))&0x7fff;
        break;
      }
      default: value=this.openBus;
    }
    this.openBus=value&0xff;this.regTrace('r',reg,value);return this.openBus;
  }
  cpuWrite(address,value){
    const reg=address&7,d=value&0xff;this.openBus=d;
    switch(reg){
      case 0:{const old=this.ctrl;this.ctrl=d;this.t=(this.t&0xf3ff)|((d&3)<<10);if((old^d)&0x80)this.updateNMILine('ctrl-write');break;}
      case 1:this.mask=d;break;
      case 3:this.oamAddr=d;break;
      case 4:this.oam[this.oamAddr]=d;this.oamAddr=(this.oamAddr+1)&0xff;break;
      case 5:
        if(!this.w){this.fineX=d&7;this.t=(this.t&0x7fe0)|(d>>3);this.w=true;}
        else{this.t=(this.t&0x0c1f)|((d&7)<<12)|((d&0xf8)<<2);this.w=false;}
        break;
      case 6:
        if(!this.w){this.t=(this.t&0x00ff)|((d&0x3f)<<8);this.w=true;}
        else{this.t=(this.t&0x7f00)|d;this.v=this.t;this.w=false;}
        break;
      case 7:this.bus.write8(this.v&0x3fff,d,'cpu-ppudata');this.v=(this.v+((this.ctrl&4)?32:1))&0x7fff;break;
    }
    this.regTrace('w',reg,d);
  }
  incrementX(){if((this.v&0x001f)===31){this.v&=~0x001f;this.v^=0x0400;}else this.v=(this.v+1)&0x7fff;}
  incrementY(){
    if((this.v&0x7000)!==0x7000)this.v=(this.v+0x1000)&0x7fff;
    else{this.v&=~0x7000;let y=(this.v&0x03e0)>>5;if(y===29){y=0;this.v^=0x0800;}else if(y===31)y=0;else y++;this.v=(this.v&~0x03e0)|(y<<5);}
  }
  copyX(){this.v=(this.v&~0x041f)|(this.t&0x041f)}
  copyY(){this.v=(this.v&~0x7be0)|(this.t&0x7be0)}
  loadBackgroundShifters(){
    this.bgPatternLo=((this.bgPatternLo&0xff00)|this.bgNextTileLo)&0xffff;
    this.bgPatternHi=((this.bgPatternHi&0xff00)|this.bgNextTileHi)&0xffff;
    this.bgAttrLo=((this.bgAttrLo&0xff00)|((this.bgNextTileAttr&1)?0xff:0))&0xffff;
    this.bgAttrHi=((this.bgAttrHi&0xff00)|((this.bgNextTileAttr&2)?0xff:0))&0xffff;
  }
  shiftBackground(){this.bgPatternLo=(this.bgPatternLo<<1)&0xffff;this.bgPatternHi=(this.bgPatternHi<<1)&0xffff;this.bgAttrLo=(this.bgAttrLo<<1)&0xffff;this.bgAttrHi=(this.bgAttrHi<<1)&0xffff;}
  backgroundFetch(){
    const phase=(this.dot-1)&7;
    switch(phase){
      case 0:this.loadBackgroundShifters();this.bgNextTileId=this.bus.read8(0x2000|(this.v&0x0fff),'bg-nt');break;
      case 2:{const a=0x23c0|(this.v&0x0c00)|((this.v>>4)&0x38)|((this.v>>2)&7);const b=this.bus.read8(a,'bg-attr');const s=((this.v>>4)&4)|(this.v&2);this.bgNextTileAttr=(b>>s)&3;break;}
      case 4:{const fineY=(this.v>>12)&7,base=(this.ctrl&0x10)?0x1000:0;this.bgNextTileLo=this.bus.read8(base+(this.bgNextTileId<<4)+fineY,'bg-pattern-lo');break;}
      case 6:{const fineY=(this.v>>12)&7,base=(this.ctrl&0x10)?0x1000:0;this.bgNextTileHi=this.bus.read8(base+(this.bgNextTileId<<4)+fineY+8,'bg-pattern-hi');break;}
      case 7:this.incrementX();break;
    }
  }
  evaluateSprites(scanline){
    this.scanlineSprites=[];const h=(this.ctrl&0x20)?16:8;let found=0;
    for(let i=0;i<64;i++){
      const base=i*4,y=this.oam[base],row=scanline-(y+1);
      if(row<0||row>=h)continue;found++;if(this.scanlineSprites.length>=8)continue;
      const tile=this.oam[base+1],attr=this.oam[base+2],x=this.oam[base+3];let r=(attr&0x80)?h-1-row:row,addr;
      if(h===16){const table=tile&1;let tileIndex=tile&0xfe;if(r>=8){tileIndex++;r-=8;}addr=(table<<12)+(tileIndex<<4)+r;}
      else addr=((this.ctrl&0x08)?0x1000:0)+(tile<<4)+r;
      const lo=this.bus.read8(addr,'sprite-pattern-lo'),hi=this.bus.read8(addr+8,'sprite-pattern-hi');
      this.scanlineSprites.push({index:i,x,attr,lo,hi});
    }
    if(found>8)this.status|=0x20;
    this.traceHub?.emit('ppuEvent',{type:'sprite-eval',frame:this.frame,scanline,dot:this.dot,found,selected:this.scanlineSprites.length});
  }
  backgroundPixel(x){
    if(!this.backgroundEnabled()|| (x<8 && !(this.mask&0x02)))return {pixel:0,palette:0};
    const bit=0x8000>>this.fineX;
    const p=((this.bgPatternLo&bit)?1:0)|((this.bgPatternHi&bit)?2:0);
    const pal=((this.bgAttrLo&bit)?1:0)|((this.bgAttrHi&bit)?2:0);
    return {pixel:p,palette:pal};
  }
  spritePixel(x){
    if(!this.spritesEnabled()||(x<8&&!(this.mask&0x04)))return null;
    for(const s of this.scanlineSprites){const col=x-s.x;if(col<0||col>=8)continue;const bit=(s.attr&0x40)?col:(7-col);const p=((s.lo>>bit)&1)|(((s.hi>>bit)&1)<<1);if(!p)continue;return {pixel:p,palette:s.attr&3,behind:!!(s.attr&0x20),sprite0:s.index===0};}
    return null;
  }
  paletteColorAddress(bg,sp){
    if(sp&&sp.pixel)return 0x3f10+(sp.palette<<2)+sp.pixel;
    if(bg.pixel)return 0x3f00+(bg.palette<<2)+bg.pixel;
    return 0x3f00;
  }
  drawPixel(x,y){
    const bg=this.backgroundPixel(x),sp=this.spritePixel(x);let useSp=false;
    if(sp){if(bg.pixel&&sp.sprite0&&x<255&&this.backgroundEnabled()&&this.spritesEnabled())this.status|=0x40;useSp=!bg.pixel||!sp.behind;}
    let palAddr=this.paletteColorAddress(bg,useSp?sp:null),colorIndex=this.bus.read8(palAddr,'pixel-palette')&0x3f;
    if(this.mask&1)colorIndex&=0x30;
    const rgb=NES_RGB[colorIndex]??0;const i=(y*256+x)*4;
    this.framebuffer[i]=(rgb>>16)&0xff;this.framebuffer[i+1]=(rgb>>8)&0xff;this.framebuffer[i+2]=rgb&0xff;this.framebuffer[i+3]=255;
  }
  tick(){
    if(this.scanline===241&&this.dot===1){this.status|=0x80;this.emitEvent('vblank-start');this.updateNMILine('vblank-start');}
    if(this.scanline===261&&this.dot===1){this.status&=~0xe0;this.emitEvent('pre-render-clear');this.updateNMILine('pre-render-clear');}

    const renderLine=this.scanline<240||this.scanline===261;
    if(this.scanline<240&&this.dot===0)this.evaluateSprites(this.scanline);
    if(this.scanline<240&&this.dot>=1&&this.dot<=256)this.drawPixel(this.dot-1,this.scanline);

    if(this.renderingEnabled()&&renderLine){
      if((this.dot>=2&&this.dot<=257)||(this.dot>=322&&this.dot<=337))this.shiftBackground();
      if((this.dot>=1&&this.dot<=256)||(this.dot>=321&&this.dot<=336))this.backgroundFetch();
      if(this.dot===256)this.incrementY();
      if(this.dot===257){this.loadBackgroundShifters();this.copyX();}
      if(this.scanline===261&&this.dot>=280&&this.dot<=304)this.copyY();
      if(this.dot===338||this.dot===340)this.bgNextTileId=this.bus.read8(0x2000|(this.v&0x0fff),'bg-nt-prefetch');
    }
    this.advanceCounters();
  }
  advanceCounters(){
    if(this.scanline===261&&this.dot===339&&this.oddFrame&&this.renderingEnabled()){
      this.dot=0;this.scanline=0;this.frame++;this.oddFrame=!this.oddFrame;this.emitEvent('frame-start',{odd:this.oddFrame});return;
    }
    this.dot++;
    if(this.dot>340){this.dot=0;this.scanline++;if(this.scanline>261){this.scanline=0;this.frame++;this.oddFrame=!this.oddFrame;this.emitEvent('frame-start',{odd:this.oddFrame});}}
  }
  runCycles(cycles){for(let i=0;i<cycles;i++)this.tick();}
  runFrame(){const target=this.frame+1;let ticks=0;while(this.frame<target){this.tick();ticks++;if(ticks>90000)throw new Error('PPU frame guard tripped');}return ticks;}
  snapshot(){return {ctrl:this.ctrl,mask:this.mask,status:this.status,oamAddr:this.oamAddr,v:this.v,t:this.t,fineX:this.fineX,w:this.w,readBuffer:this.readBuffer,scanline:this.scanline,dot:this.dot,frame:this.frame,oddFrame:this.oddFrame,nmiLine:this.nmiLine};}
}
