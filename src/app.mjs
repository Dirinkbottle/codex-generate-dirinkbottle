import { runSelfTests } from '../tests/selftest.mjs';
import { NESMachine } from './core/machine.mjs';
import { hex8, hex16 } from './core/debug.mjs';

const $ = s => document.querySelector(s);
const machine = new NESMachine();
const file=$('#rom'),status=$('#status'),meta=$('#meta'),tests=$('#tests'),trace=$('#trace');
const stepBtn=$('#step'),runBtn=$('#run'),frameBtn=$('#frame'),resetBtn=$('#reset'),channel=$('#trace-channel');
const canvas=$('#screen'),ctx=canvas.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;

function showReport(r){tests.innerHTML=r.results.map(x=>`<li class="${x.ok?'ok':'bad'}">${x.ok?'✓':'✗'} ${x.name}</li>`).join('');$('#test-summary').textContent=`${r.passed}/${r.total} P1 CPU self-tests passed`;$('#test-summary').className=r.failed?'badbox':'okbox';}
function buttons(on){for(const b of [stepBtn,runBtn,frameBtn,resetBtn])b.disabled=!on;}
function renderScreen(){if(!machine.loaded)return;const image=new ImageData(machine.ppu.framebuffer,256,240);ctx.putImageData(image,0,0);}
function compactTrace(e){
  if(!e)return '';
  if(e.channel==='cpu')return e.type==='interrupt'?`${e.kind} PC=$${hex16(e.pc)} -> $${hex16(e.nextPC)} +${e.spent}`:`$${hex16(e.pc)} ${e.mnemonic.padEnd(3)} ${e.mode.padEnd(3)} A=${hex8(e.a)} X=${hex8(e.x)} Y=${hex8(e.y)} SP=${hex8(e.sp)} +${e.spent}`;
  if(e.channel==='cpuMem')return `${e.kind.toUpperCase()} $${hex16(e.address)} -> ${e.device}[$${hex16(e.mappedAddress)}] = $${hex8(e.value)} (${e.source})`;
  if(e.channel==='ppuReg')return `${e.kind.toUpperCase()} $${hex16(e.address)} = $${hex8(e.value)} @ F${e.frame} S${e.scanline} D${e.dot} v=$${hex16(e.v)} t=$${hex16(e.t)} x=${e.x} w=${Number(e.w)}`;
  if(e.channel==='ppuMem')return `${e.kind.toUpperCase()} $${hex16(e.address)} ${e.device} = $${hex8(e.value)} (${e.source})`;
  if(e.channel==='ppuEvent')return `${e.type} @ F${e.frame} S${e.scanline} D${e.dot}${e.reason?` reason=${e.reason}`:''}${e.found!=null?` found=${e.found} selected=${e.selected}`:''}`;
  return JSON.stringify(e);
}
function showTrace(){if(!machine.loaded){trace.textContent='No trace yet.';return;}const c=channel.value;trace.textContent=machine.traceHub.tail(c,80).map(compactTrace).join('\n')||`No ${c} records yet.`;}
function showState(extra=''){
  const s=machine.snapshot();
  meta.textContent=JSON.stringify({mapper:s.mapper,mirroring:s.mirroring,chr:s.chrIsRam?'CHR-RAM':'CHR-ROM',cpu:{pc:`$${hex16(s.cpu.pc)}`,a:`$${hex8(s.cpu.a)}`,x:`$${hex8(s.cpu.x)}`,y:`$${hex8(s.cpu.y)}`,sp:`$${hex8(s.cpu.sp)}`,cycles:s.cpu.cycles},ppu:{frame:s.ppu.frame,scanline:s.ppu.scanline,dot:s.ppu.dot,ctrl:`$${hex8(s.ppu.ctrl)}`,mask:`$${hex8(s.ppu.mask)}`,status:`$${hex8(s.ppu.status)}`,v:`$${hex16(s.ppu.v)}`,t:`$${hex16(s.ppu.t)}`,fineX:s.ppu.fineX,w:s.ppu.w},breakReason:s.breakReason,note:'P3: real PPU registers/memory/timing/background/sprites. APU/controller/OAM DMA remain P4.'},null,2)+(extra?`\n\n${extra}`:'');
  renderScreen();showTrace();
}
function runAction(fn,label){try{const r=fn();status.textContent=`${label}: CPU ${r.executed??0} instructions, ${r.cpuCycles??r.spent??0} cycles; PPU F${machine.ppu.frame} S${machine.ppu.scanline} D${machine.ppu.dot}.`;status.className='okbox';showState();}catch(e){status.textContent=e.message;status.className='badbox';showState();}}

showReport(runSelfTests());buttons(false);showTrace();
file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{const s=machine.loadROM(await f.arrayBuffer());status.textContent=`ROM 已接入整机：Mapper ${s.mapper}，CPU reset PC=$${hex16(s.cpu.pc)}，真实 PPU 已连接。`;status.className='okbox';buttons(true);showState(`ROM: ${f.name} (${f.size} bytes)`);}catch(e){status.textContent=e.message;status.className='badbox';buttons(false);meta.textContent='';trace.textContent='';ctx.clearRect(0,0,256,240);}});
stepBtn.addEventListener('click',()=>runAction(()=>machine.step(1),'Step'));
runBtn.addEventListener('click',()=>runAction(()=>machine.step(1000),'Run 1000'));
frameBtn.addEventListener('click',()=>runAction(()=>machine.runFrame(),'Run frame'));
resetBtn.addEventListener('click',()=>{machine.reset();status.textContent=`整机 reset：CPU PC=$${hex16(machine.cpu.pc)}，PPU 回到 pre-render。`;status.className='okbox';showState();});
channel.addEventListener('change',showTrace);
