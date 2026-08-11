const LENGTH_TABLE = [10,254,20,2,40,4,80,6,160,8,60,10,14,12,26,14,12,16,24,18,48,20,96,22,192,24,72,26,16,28,32,30];
const DUTY = [
  [0,1,0,0,0,0,0,0],
  [0,1,1,0,0,0,0,0],
  [0,1,1,1,1,0,0,0],
  [1,0,0,1,1,1,1,1],
];
const TRI = [15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
const NOISE_PERIOD = [4,8,16,32,64,96,128,160,202,254,380,508,762,1016,2034,4068];
const DMC_PERIOD = [428,380,340,320,286,254,226,214,190,160,142,128,106,85,72,54];

class Envelope {
  constructor(){this.start=false;this.loop=false;this.constant=false;this.period=0;this.divider=0;this.decay=0;}
  write(v){this.loop=!!(v&0x20);this.constant=!!(v&0x10);this.period=v&0x0f;}
  restart(){this.start=true;}
  quarter(){if(this.start){this.start=false;this.decay=15;this.divider=this.period;}else if(this.divider===0){this.divider=this.period;if(this.decay===0){if(this.loop)this.decay=15;}else this.decay--;}else this.divider--;}
  output(){return this.constant?this.period:this.decay;}
}
class Pulse {
  constructor(index){this.index=index;this.envelope=new Envelope();this.enabled=false;this.duty=0;this.seq=0;this.timerPeriod=0;this.timer=0;this.length=0;this.sweepEnabled=false;this.sweepPeriod=0;this.sweepNegate=false;this.sweepShift=0;this.sweepDivider=0;this.sweepReload=false;}
  write(reg,v){if(reg===0){this.duty=(v>>6)&3;this.envelope.write(v);}else if(reg===1){this.sweepEnabled=!!(v&0x80);this.sweepPeriod=(v>>4)&7;this.sweepNegate=!!(v&8);this.sweepShift=v&7;this.sweepReload=true;}else if(reg===2){this.timerPeriod=(this.timerPeriod&0x700)|v;}else{this.timerPeriod=(this.timerPeriod&0xff)|((v&7)<<8);if(this.enabled)this.length=LENGTH_TABLE[(v>>3)&31];this.seq=0;this.envelope.restart();}}
  setEnabled(on){this.enabled=on;if(!on)this.length=0;}
  target(){if(this.sweepShift===0)return this.timerPeriod;const delta=this.timerPeriod>>this.sweepShift;return this.sweepNegate?this.timerPeriod-delta-(this.index===1?1:0):this.timerPeriod+delta;}
  muted(){const target=this.target();return this.timerPeriod<8||target>0x7ff||target<0;}
  tickTimer(){if(this.timer===0){this.timer=this.timerPeriod;this.seq=(this.seq+1)&7;}else this.timer--;}
  quarter(){this.envelope.quarter();}
  half(){if(this.length>0&&!this.envelope.loop)this.length--;const target=this.target();if(this.sweepDivider===0&&this.sweepEnabled&&this.sweepShift>0&&!this.muted())this.timerPeriod=target&0x7ff;if(this.sweepDivider===0||this.sweepReload){this.sweepDivider=this.sweepPeriod;this.sweepReload=false;}else this.sweepDivider--;}
  output(){if(!this.enabled||this.length===0||this.muted()||!DUTY[this.duty][this.seq])return 0;return this.envelope.output();}
}
class Triangle {
  constructor(){this.enabled=false;this.control=false;this.linearReload=0;this.linear=0;this.reloadFlag=false;this.timerPeriod=0;this.timer=0;this.seq=0;this.length=0;}
  write(reg,v){if(reg===0){this.control=!!(v&0x80);this.linearReload=v&0x7f;}else if(reg===2){this.timerPeriod=(this.timerPeriod&0x700)|v;}else if(reg===3){this.timerPeriod=(this.timerPeriod&0xff)|((v&7)<<8);if(this.enabled)this.length=LENGTH_TABLE[(v>>3)&31];this.reloadFlag=true;}}
  setEnabled(on){this.enabled=on;if(!on)this.length=0;}
  tickTimer(){if(this.timer===0){this.timer=this.timerPeriod;if(this.enabled&&this.length>0&&this.linear>0&&this.timerPeriod>1)this.seq=(this.seq+1)&31;}else this.timer--;}
  quarter(){if(this.reloadFlag)this.linear=this.linearReload;else if(this.linear>0)this.linear--;if(!this.control)this.reloadFlag=false;}
  half(){if(this.length>0&&!this.control)this.length--;}
  output(){return this.enabled&&this.length>0&&this.linear>0?TRI[this.seq]:0;}
}
class Noise {
  constructor(){this.enabled=false;this.envelope=new Envelope();this.mode=false;this.period=NOISE_PERIOD[0];this.timer=0;this.shift=1;this.length=0;}
  write(reg,v){if(reg===0)this.envelope.write(v);else if(reg===2){this.mode=!!(v&0x80);this.period=NOISE_PERIOD[v&15];}else if(reg===3){if(this.enabled)this.length=LENGTH_TABLE[(v>>3)&31];this.envelope.restart();}}
  setEnabled(on){this.enabled=on;if(!on)this.length=0;}
  tickTimer(){if(this.timer===0){this.timer=this.period;const tap=this.mode?6:1,fb=(this.shift&1)^((this.shift>>tap)&1);this.shift=((this.shift>>1)|(fb<<14))&0x7fff;}else this.timer--;}
  quarter(){this.envelope.quarter();}
  half(){if(this.length>0&&!this.envelope.loop)this.length--;}
  output(){if(!this.enabled||this.length===0||(this.shift&1))return 0;return this.envelope.output();}
}
class DMC {
  constructor(onIrq){this.onIrq=onIrq;this.reset();}
  reset(){this.irqEnable=false;this.loop=false;this.period=DMC_PERIOD[0];this.timer=this.period;this.output=0;this.sampleAddressReg=0;this.sampleLengthReg=0;this.currentAddress=0xc000;this.bytesRemaining=0;this.sampleBuffer=null;this.shift=0;this.bits=8;this.silence=true;this.irq=false;this.dmaPending=false;}
  write(reg,v){if(reg===0){this.irqEnable=!!(v&0x80);this.loop=!!(v&0x40);this.period=DMC_PERIOD[v&15];if(!this.irqEnable){this.irq=false;this.onIrq?.();}}else if(reg===1)this.output=v&0x7f;else if(reg===2)this.sampleAddressReg=v;else if(reg===3)this.sampleLengthReg=v;}
  restart(){this.currentAddress=0xc000+(this.sampleAddressReg<<6);this.bytesRemaining=(this.sampleLengthReg<<4)+1;this.requestIfNeeded();}
  setEnabled(on){if(!on){this.bytesRemaining=0;this.dmaPending=false;}else if(this.bytesRemaining===0)this.restart();this.irq=false;this.onIrq?.();}
  requestIfNeeded(){if(this.sampleBuffer===null&&this.bytesRemaining>0)this.dmaPending=true;}
  takeDmaRequest(){if(!this.dmaPending)return null;this.dmaPending=false;return {address:this.currentAddress};}
  supplyByte(value){this.sampleBuffer=value&0xff;this.currentAddress=this.currentAddress===0xffff?0x8000:(this.currentAddress+1)&0xffff;this.bytesRemaining--;if(this.bytesRemaining===0){if(this.loop)this.restart();else if(this.irqEnable){this.irq=true;this.onIrq?.();}}}
  tick(){if(this.timer===0){this.timer=this.period;if(!this.silence){if(this.shift&1){if(this.output<=125)this.output+=2;}else if(this.output>=2)this.output-=2;}this.shift>>>=1;this.bits--;if(this.bits===0){this.bits=8;if(this.sampleBuffer===null)this.silence=true;else{this.silence=false;this.shift=this.sampleBuffer;this.sampleBuffer=null;this.requestIfNeeded();}}}else this.timer--;this.requestIfNeeded();}
}

export class APU2A03 {
  constructor({traceHub=null,cycle=()=>this.cpuCycle,onIRQChange=null,sampleRate=48000,cpuHz=1789773}={}){
    this.traceHub=traceHub;this.cycleProvider=cycle;this.onIRQChange=onIRQChange;this.sampleRate=sampleRate;this.cpuHz=cpuHz;
    this.p1=new Pulse(1);this.p2=new Pulse(2);this.triangle=new Triangle();this.noise=new Noise();this.dmc=new DMC(()=>this.updateIRQ());this.samples=[];this.reset();
  }
  reset(){this.cpuCycle=0;this.frameCycle=0;this.frameMode5=false;this.irqInhibit=false;this.frameIRQ=false;this.sampleAcc=0;this.samples.length=0;this.hpIn=0;this.hpOut=0;this.p1=new Pulse(1);this.p2=new Pulse(2);this.triangle=new Triangle();this.noise=new Noise();this.dmc=new DMC(()=>this.updateIRQ());this.updateIRQ();}
  now(){return this.cycleProvider?.()??this.cpuCycle;}
  emit(type,extra={}){this.traceHub?.emit('apuEvent',{type,cycle:this.now(),frameCycle:this.frameCycle,...extra});}
  regTrace(kind,address,value){this.traceHub?.emit('apuReg',{kind,address,value:value&0xff,cycle:this.now()});}
  updateIRQ(){this.onIRQChange?.(!!(this.frameIRQ||this.dmc.irq));}
  cpuWrite(address,value){const a=address&0xffff,v=value&0xff;this.regTrace('w',a,v);if(a>=0x4000&&a<=0x4003)this.p1.write(a-0x4000,v);else if(a>=0x4004&&a<=0x4007)this.p2.write(a-0x4004,v);else if(a===0x4008)this.triangle.write(0,v);else if(a===0x400a)this.triangle.write(2,v);else if(a===0x400b)this.triangle.write(3,v);else if(a===0x400c)this.noise.write(0,v);else if(a===0x400e)this.noise.write(2,v);else if(a===0x400f)this.noise.write(3,v);else if(a>=0x4010&&a<=0x4013)this.dmc.write(a-0x4010,v);else if(a===0x4015){this.p1.setEnabled(!!(v&1));this.p2.setEnabled(!!(v&2));this.triangle.setEnabled(!!(v&4));this.noise.setEnabled(!!(v&8));this.dmc.setEnabled(!!(v&16));}else if(a===0x4017){this.frameMode5=!!(v&0x80);this.irqInhibit=!!(v&0x40);if(this.irqInhibit){this.frameIRQ=false;this.updateIRQ();}this.frameCycle=0;this.emit('frame-counter-write',{mode:this.frameMode5?5:4,irqInhibit:this.irqInhibit});if(this.frameMode5){this.clockQuarter();this.clockHalf();}}}
  cpuRead4015(){let v=0;if(this.p1.length)v|=1;if(this.p2.length)v|=2;if(this.triangle.length)v|=4;if(this.noise.length)v|=8;if(this.dmc.bytesRemaining)v|=16;if(this.frameIRQ)v|=0x40;if(this.dmc.irq)v|=0x80;this.frameIRQ=false;this.updateIRQ();this.regTrace('r',0x4015,v);return v;}
  clockQuarter(){this.p1.quarter();this.p2.quarter();this.triangle.quarter();this.noise.quarter();this.emit('quarter-frame');}
  clockHalf(){this.p1.half();this.p2.half();this.triangle.half();this.noise.half();this.emit('half-frame');}
  clockFrameSequencer(){
    const c=this.frameCycle;
    if(!this.frameMode5){if(c===7457||c===14913||c===22371||c===29829)this.clockQuarter();if(c===14913||c===29829)this.clockHalf();if(c===29829){if(!this.irqInhibit){this.frameIRQ=true;this.emit('frame-irq');this.updateIRQ();}this.frameCycle=0;}}
    else{if(c===7457||c===14913||c===22371||c===37281)this.clockQuarter();if(c===14913||c===37281)this.clockHalf();if(c===37281)this.frameCycle=0;}
  }
  mix(){const p=this.p1.output()+this.p2.output();const t=this.triangle.output(),n=this.noise.output(),d=this.dmc.output;const pulse=p?95.88/(8128/p+100):0;const denom=t/8227+n/12241+d/22638;const raw=pulse+(denom?159.79/(1/denom+100):0);const out=raw-this.hpIn+0.995*this.hpOut;this.hpIn=raw;this.hpOut=out;return Math.max(-1,Math.min(1,out));}
  tick(){this.cpuCycle++;this.frameCycle++;if((this.cpuCycle&1)===0){this.p1.tickTimer();this.p2.tickTimer();}this.triangle.tickTimer();this.noise.tickTimer();this.dmc.tick();this.clockFrameSequencer();this.sampleAcc+=this.sampleRate;if(this.sampleAcc>=this.cpuHz){this.sampleAcc-=this.cpuHz;const sample=this.mix();this.samples.push(sample);if(this.samples.length>65536)this.samples.shift();this.traceHub?.emit('audioSample',{cycle:this.now(),sample});}}
  takeDmcDmaRequest(){return this.dmc.takeDmaRequest();}
  supplyDmcByte(v){this.dmc.supplyByte(v);this.traceHub?.emit('apuEvent',{type:'dmc-byte',cycle:this.now(),value:v&0xff,address:(this.dmc.currentAddress-1)&0xffff,remaining:this.dmc.bytesRemaining});}
  drainSamples(){const s=Float32Array.from(this.samples);this.samples.length=0;return s;}
  snapshot(){return {cpuCycle:this.cpuCycle,frameCycle:this.frameCycle,frameMode:this.frameMode5?5:4,frameIRQ:this.frameIRQ,dmcIRQ:this.dmc.irq,pulse1:{length:this.p1.length,period:this.p1.timerPeriod,output:this.p1.output()},pulse2:{length:this.p2.length,period:this.p2.timerPeriod,output:this.p2.output()},triangle:{length:this.triangle.length,linear:this.triangle.linear,output:this.triangle.output()},noise:{length:this.noise.length,shift:this.noise.shift,output:this.noise.output()},dmc:{output:this.dmc.output,address:this.dmc.currentAddress,remaining:this.dmc.bytesRemaining,dmaPending:this.dmc.dmaPending}};}
}
export function hashAudio(samples){let h=0x811c9dc5;for(const x of samples){const q=Math.max(-32768,Math.min(32767,Math.round(x*32767)))&0xffff;h^=q&0xff;h=Math.imul(h,0x01000193)>>>0;h^=(q>>8)&0xff;h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');}
