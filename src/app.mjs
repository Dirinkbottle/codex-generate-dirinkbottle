import { parseINES } from './core/ines.mjs';
import { runSelfTests } from '../tests/selftest.mjs';

const $ = (sel) => document.querySelector(sel);
const file = $('#rom');
const status = $('#status');
const meta = $('#meta');
const tests = $('#tests');

function showReport(report) {
  tests.innerHTML = report.results.map(r => `<li class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${r.name}</li>`).join('');
  $('#test-summary').textContent = `${report.passed}/${report.total} self-tests passed`;
}

showReport(runSelfTests());

file.addEventListener('change', async () => {
  const chosen = file.files?.[0];
  if (!chosen) return;
  try {
    const cart = parseINES(await chosen.arrayBuffer());
    status.textContent = 'ROM 解析成功（Stage 1 尚未连接完整 NES 总线/PPU）';
    status.className = 'okbox';
    meta.textContent = JSON.stringify({ name: chosen.name, size: chosen.size, format: cart.format, mapper: cart.mapper, mirroring: cart.mirroring, prgKiB: cart.prgRom.length / 1024, chrKiB: cart.chrRom.length / 1024, battery: cart.hasBattery, trainer: cart.hasTrainer }, null, 2);
  } catch (e) {
    status.textContent = e.message; status.className = 'badbox'; meta.textContent = '';
  }
});
