import { strict as assert } from 'node:assert';
import { TraceHub } from '../src/core/debug.mjs';
import { BUTTON, NESController, ControllerPorts, InputTimeline } from '../src/core/controller.mjs';
import { APU2A03, hashAudio } from '../src/core/apu.mjs';
import { MasterClock } from '../src/core/scheduler.mjs';
import { NESBus, APUIOStub } from '../src/core/nesbus.mjs';
import { traceSignature, firstTraceDivergence, snapshotSignature } from '../src/core/diagnostics.mjs';
let passed=0;const test=(name,fn)=>{fn();console.log(`PASS ${name}`);passed++;};

test('controller serial order is A,B,Select,Start,Up,Down,Left,Right then ones',()=>{const c=new NESController();c.setButtons(BUTTON.A|BUTTON.START|BUTTON.LEFT);c.writeStrobe(1);c.writeStrobe(0);assert.deepEqual(Array.from({length:10},()=>c.read()),[1,0,0,1,0,0,1,0,1,1]);});
test('controller strobe uses bit 0 only',()=>{const c=new NESController();c.setButtons(BUTTON.A);c.writeStrobe(2);assert.equal(c.strobe,false);c.writeStrobe(1);assert.equal(c.strobe,true);});
test('strobe high continuously samples current A',()=>{const c=new NESController();c.writeStrobe(1);c.setButtons(BUTTON.A);assert.equal(c.read(),1);c.setButtons(0);assert.equal(c.read(),0);});
test('both controller ports latch from $4016',()=>{const p=new ControllerPorts();p.setButtons(1,BUTTON.A);p.setButtons(2,BUTTON.B);p.cpuWrite4016(1);p.cpuWrite4016(0);assert.equal(p.cpuRead(0x4016),1);assert.equal(p.cpuRead(0x4017),0);assert.equal(p.cpuRead(0x4017),1);});
test('input record/replay applies identical masks at original CPU cycles',()=>{const p=new ControllerPorts(),tl=new InputTimeline();tl.beginRecord();tl.record(10,1,BUTTON.A);tl.record(20,1,BUTTON.B);const ev=tl.stop();tl.beginReplay(ev);tl.applyUntil(9,p);assert.equal(p.p1.buttons,0);tl.applyUntil(10,p);assert.equal(p.p1.buttons,BUTTON.A);tl.applyUntil(20,p);assert.equal(p.p1.buttons,BUTTON.B);});

test('$4015 enable gates pulse length counter',()=>{const a=new APU2A03();a.cpuWrite(0x4015,1);a.cpuWrite(0x4003,0xf8);assert.ok(a.p1.length>0);a.cpuWrite(0x4015,0);assert.equal(a.p1.length,0);});
test('APU frame sequencer emits quarter and half clocks',()=>{const tr=new TraceHub(),a=new APU2A03({traceHub:tr});for(let i=0;i<14913;i++)a.tick();const types=tr.snapshot('apuEvent').map(e=>e.type);assert.ok(types.includes('quarter-frame'));assert.ok(types.includes('half-frame'));});
test('$4015 status read reports and clears frame IRQ',()=>{let irq=false;const a=new APU2A03({onIRQChange:x=>irq=x});for(let i=0;i<29829;i++)a.tick();assert.equal(irq,true);assert.ok(a.cpuRead4015()&0x40);assert.equal(a.frameIRQ,false);assert.equal(irq,false);});
test('triangle linear counter reloads on quarter frame',()=>{const a=new APU2A03();a.cpuWrite(0x4015,4);a.cpuWrite(0x4008,0x85);a.cpuWrite(0x400b,0xf8);a.clockQuarter();assert.equal(a.triangle.linear,5);});
test('noise LFSR advances deterministically',()=>{const a=new APU2A03(),s=a.noise.shift;for(let i=0;i<5;i++)a.noise.tickTimer();assert.notEqual(a.noise.shift,s);});
test('DMC first DMA request uses $C000 + value*64 and value*16+1 length',()=>{const a=new APU2A03();a.cpuWrite(0x4012,0x12);a.cpuWrite(0x4013,0x03);a.cpuWrite(0x4015,0x10);assert.equal(a.takeDmcDmaRequest().address,0xc000+(0x12<<6));assert.equal(a.dmc.bytesRemaining,0x31);a.supplyDmcByte(0xaa);assert.equal(a.dmc.bytesRemaining,0x30);});
test('fixed APU script produces deterministic PCM signature',()=>{function run(){const a=new APU2A03({sampleRate:8000});a.cpuWrite(0x4015,1);a.cpuWrite(0x4000,0xbf);a.cpuWrite(0x4002,0x80);a.cpuWrite(0x4003,0x08);for(let i=0;i<20000;i++)a.tick();return hashAudio(a.drainSamples());}assert.equal(run(),run());});
test('silent APU produces zero PCM rather than DC offset',()=>{const a=new APU2A03({sampleRate:8000});for(let i=0;i<20000;i++)a.tick();const s=a.drainSamples();assert.ok(s.length>0);assert.ok(Array.from(s).every(v=>Math.abs(v)<1e-9));});

function rig(start=0){const traceHub=new TraceHub(),mem=new Uint8Array(65536);for(let i=0;i<256;i++)mem[0x0200+i]=i;const bus={page:null,breakReason:null,read8:a=>mem[a],takeOamDmaRequest(){const p=this.page;this.page=null;return p;}};const ppu={frame:0,scanline:0,dot:0,oam:new Uint8Array(256),oamAddr:0,runCycles(n){this.dot+=n;},cpuWrite(a,v){if((a&7)===4){this.oam[this.oamAddr]=v;this.oamAddr=(this.oamAddr+1)&255;}}};const apu={ticks:0,tick(){this.ticks++;},takeDmcDmaRequest(){return null;}};const cpu={pc:0x8000,step(){this.pc++;return 2;}};return {traceHub,mem,bus,ppu,apu,cpu,s:new MasterClock({cpu,ppu,apu,bus,traceHub,startCpuCycle:start})};}
test('OAM DMA even parity costs 513 cycles and copies 256 bytes',()=>{const r=rig(0);r.bus.page=2;assert.equal(r.s.drainPendingDma(),513);assert.equal(r.ppu.oam[255],255);});
test('OAM DMA odd parity costs 514 cycles',()=>{const r=rig(1);r.bus.page=2;assert.equal(r.s.drainPendingDma(),514);});
test('OAM DMA trace contains 256 read/write pairs',()=>{const r=rig();r.bus.page=2;r.s.drainPendingDma();const d=r.traceHub.snapshot('dma');assert.equal(d.filter(x=>x.type==='oam-read').length,256);assert.equal(d.filter(x=>x.type==='oam-write').length,256);});
test('DMC DMA stalls four CPU cycles and supplies fetched byte',()=>{const r=rig(10);r.mem[0xc123]=0x5a;let supplied;r.apu.supplyDmcByte=v=>supplied=v;r.s.serviceDmcDma({address:0xc123});assert.equal(r.s.cpuCycle,14);assert.equal(supplied,0x5a);});
test('scheduler advances APU 1x and PPU 3x per CPU cycle',()=>{const r=rig();r.s.stepInstruction();assert.equal(r.apu.ticks,2);assert.equal(r.ppu.dot,6);});

test('NESBus preserves P2 APUIOStub fallback',()=>{const a=new APUIOStub(),b=new NESBus({apuIo:a});b.write8(0x4016,0x33);assert.equal(b.read8(0x4016),0x33);});
test('$4014 queues a DMA request at bus boundary',()=>{const b=new NESBus({apu:{cpuWrite(){}}});b.write8(0x4014,2);assert.equal(b.takeOamDmaRequest(),2);assert.equal(b.takeOamDmaRequest(),null);});
test('$4016/$4017 route to controller serial ports',()=>{const p=new ControllerPorts(),b=new NESBus({apu:{cpuWrite(){},cpuRead4015(){return 0;}},controllers:p});p.setButtons(1,BUTTON.A);b.write8(0x4016,1);b.write8(0x4016,0);assert.equal(b.read8(0x4016)&1,1);});
test('$4015 routes to APU status rather than controller',()=>{const b=new NESBus({apu:{cpuWrite(){},cpuRead4015(){return 0x5a;}},controllers:new ControllerPorts()});assert.equal(b.read8(0x4015),0x5a);});

test('TraceHub stamps cross-device records with global sequence/cycle',()=>{let cycle=42;const h=new TraceHub();h.setClock(()=>cycle);const a=h.emit('dma',{type:'x'});cycle=43;const b=h.emit('apuEvent',{type:'y'});assert.equal(a.cpuCycle,42);assert.equal(b.cpuCycle,43);assert.equal(b.seq,a.seq+1);});
test('trace signature ignores sequence numbers by default',()=>{const a=[{seq:1,cpuCycle:10,v:1}],b=[{seq:99,cpuCycle:10,v:1}];assert.equal(traceSignature(a),traceSignature(b));});
test('first-divergence debugger returns first mismatching cycle window',()=>{const a=[{seq:1,cpuCycle:10,v:1},{seq:2,cpuCycle:11,v:2}],b=[{seq:8,cpuCycle:10,v:1},{seq:9,cpuCycle:11,v:3}];const d=firstTraceDivergence(a,b);assert.equal(d.index,1);assert.equal(d.left.cpuCycle,11);});
test('snapshot signature is key-order independent',()=>{assert.equal(snapshotSignature({b:2,a:1}),snapshotSignature({a:1,b:2}));});
console.log(`\n${passed}/26 P4 tests passed`);
