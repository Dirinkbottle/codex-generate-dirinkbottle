export const BUTTON = Object.freeze({A:1<<0,B:1<<1,SELECT:1<<2,START:1<<3,UP:1<<4,DOWN:1<<5,LEFT:1<<6,RIGHT:1<<7});
function maskOf(state){if(typeof state==='number')return state&0xff;let m=0;for(const [k,b] of Object.entries(BUTTON))if(state?.[k]||state?.[k.toLowerCase()])m|=b;return m;}
export class NESController {
  constructor({port=1,traceHub=null,cycle=()=>0}={}){this.port=port;this.traceHub=traceHub;this.cycle=cycle;this.buttons=0;this.shift=0;this.strobe=false;}
  setButtons(state){this.buttons=maskOf(state);if(this.strobe)this.shift=this.buttons;this.traceHub?.emit('controller',{type:'input',port:this.port,cycle:this.cycle(),mask:this.buttons});return this.buttons;}
  writeStrobe(value){const next=!!(value&1),prev=this.strobe;this.strobe=next;if(next||prev&&!next)this.shift=this.buttons;this.traceHub?.emit('controller',{type:'strobe',port:this.port,cycle:this.cycle(),value:value&0xff,high:next,latched:this.shift});}
  read(){let bit;if(this.strobe){this.shift=this.buttons;bit=this.buttons&1;}else{bit=this.shift&1;this.shift=((this.shift>>>1)|0x80)&0xff;}this.traceHub?.emit('controller',{type:'read',port:this.port,cycle:this.cycle(),bit,shift:this.shift,strobe:this.strobe});return bit;}
  snapshot(){return {buttons:this.buttons,shift:this.shift,strobe:this.strobe};}
}
export class ControllerPorts {
  constructor({traceHub=null,cycle=()=>0}={}){this.p1=new NESController({port:1,traceHub,cycle});this.p2=new NESController({port:2,traceHub,cycle});}
  setButtons(port,state){return (port===2?this.p2:this.p1).setButtons(state)}
  cpuWrite4016(value){this.p1.writeStrobe(value);this.p2.writeStrobe(value)}
  cpuRead(address){return (address&1)?this.p2.read():this.p1.read()}
  snapshot(){return {p1:this.p1.snapshot(),p2:this.p2.snapshot()};}
}
export class InputTimeline {
  constructor({traceHub=null}={}){this.traceHub=traceHub;this.events=[];this.mode='live';this.cursor=0;}
  beginRecord(){this.events=[];this.cursor=0;this.mode='record';}
  record(cycle,port,mask){if(this.mode!=='record')return;this.events.push({cycle,port,mask:mask&0xff});}
  stop(){this.mode='live';return this.events.slice();}
  beginReplay(events){this.events=events.map(e=>({...e})).sort((a,b)=>a.cycle-b.cycle);this.cursor=0;this.mode='replay';}
  applyUntil(cycle,ports){if(this.mode!=='replay')return;while(this.cursor<this.events.length&&this.events[this.cursor].cycle<=cycle){const e=this.events[this.cursor++];ports.setButtons(e.port,e.mask);this.traceHub?.emit('controller',{type:'replay',cycle:e.cycle,port:e.port,mask:e.mask});}}
}
