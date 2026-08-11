import { runSelfTests } from '../tests/selftest.mjs';
import { NESMachine } from './core/machine.mjs';
import { hex16 } from './core/debug.mjs';

const $ = s => document.querySelector(s);
const machine = new NESMachine();
const file = $('#rom'), status = $('#status'), meta = $('#meta'), tests = $('#tests'), trace = $('#trace');
const stepBtn = $('#step'), runBtn = $('#run'), resetBtn = $('#reset');

function showReport(r) {
  tests.innerHTML = r.results.map(x=>`<li class="${x.ok?'ok':'bad'}">${x.ok?'✓':'✗'} ${x.name}</li>`).join('');
  $('#test-summary').textContent = `${r.passed}/${r.total} P1 self-tests passed`;
  $('#test-summary').className = r.failed ? 'badbox' : 'okbox';
}
function buttons(on){for(const b of [stepBtn,runBtn,resetBtn])b.disabled=!on}
function showTrace(){if(!machine.loaded){trace.textContent='No CPU trace yet.';return}trace.textContent=machine.trace.tail(24).map(r=>`$${hex16(r.pc)}  ${r.mnemonic.padEnd(3)} ${r.mode.padEnd(3)}  A=${r.a.toString(16).padStart(2,'0')} X=${r.x.toString(16).padStart(2,'0')} Y=${r.y.toString(16).padStart(2,'0')} SP=${r.sp.toString(16).padStart(2,'0')}  +${r.spent}`).join('\n')||'CPU reset; no instructions stepped yet.'}
function showState(extra=''){const s=machine.snapshot();meta.textContent=JSON.stringify({mapper:s.mapper,mirroring:s.mirroring,chr:s.chrIsRam?'CHR-RAM':'CHR-ROM',resetOrCurrentPC:`$${hex16(s.cpu.pc)}`,cycles:s.cpu.cycles,breakReason:s.breakReason,note:'P2: CPU/cartridge/bus are real; PPU and APU are observable stubs.'},null,2)+(extra?`\n\n${extra}`:'');showTrace()}

showReport(runSelfTests()); buttons(false); showTrace();
file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{const s=machine.loadROM(await f.arrayBuffer());status.textContent=`ROM 已接入 NES Bus，CPU reset PC = $${hex16(s.cpu.pc)}。Mapper ${s.mapper}.`;status.className='okbox';buttons(true);showState(`ROM: ${f.name} (${f.size} bytes)`)}catch(e){status.textContent=e.message;status.className='badbox';buttons(false);meta.textContent='';trace.textContent=''}});
stepBtn.addEventListener('click',()=>{try{machine.step(1);showState()}catch(e){status.textContent=e.message;status.className='badbox';showTrace()}});
runBtn.addEventListener('click',()=>{try{const r=machine.step(1000);status.textContent=`执行 ${r.executed} 条指令，当前 PC=$${hex16(machine.cpu.pc)}。`;status.className='okbox';showState()}catch(e){status.textContent=e.message;status.className='badbox';showTrace()}});
resetBtn.addEventListener('click',()=>{machine.reset();status.textContent=`CPU 已重新读取 cartridge reset vector：$${hex16(machine.cpu.pc)}`;status.className='okbox';showState()});
