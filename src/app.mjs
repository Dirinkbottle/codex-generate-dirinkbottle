import { parseINES } from './core/ines.mjs';
import { runSelfTests } from '../tests/selftest.mjs';
const $=s=>document.querySelector(s),file=$('#rom'),status=$('#status'),meta=$('#meta'),tests=$('#tests');
function showReport(r){tests.innerHTML=r.results.map(x=>`<li class="${x.ok?'ok':'bad'}">${x.ok?'✓':'✗'} ${x.name}</li>`).join('');$('#test-summary').textContent=`${r.passed}/${r.total} self-tests passed`;$('#test-summary').className=r.failed?'badbox':'okbox'}
showReport(runSelfTests());
file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{const c=parseINES(await f.arrayBuffer());status.textContent='ROM 解析成功。P1 CPU 已完成；P2 将把 PRG ROM 映射到真正的 NES CPU Bus。';status.className='okbox';meta.textContent=JSON.stringify({name:f.name,size:f.size,format:c.format,mapper:c.mapper,mirroring:c.mirroring,prgKiB:c.prgRom.length/1024,chrKiB:c.chrRom.length/1024,battery:c.hasBattery,trainer:c.hasTrainer},null,2)}catch(e){status.textContent=e.message;status.className='badbox';meta.textContent=''}});
