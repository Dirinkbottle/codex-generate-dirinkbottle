import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
let passed=0;
const test=(name,fn)=>{fn();console.log(`PASS ${name}`);passed++;};

test('player-first shell keeps only ROM, screen and primary controls visible',()=>{
  for(const id of ['rom','screen','play','reset','save-state','load-state','virtual-pad'])assert.ok(html.includes(`id="${id}"`),id);
});

test('developer/debug panel exists and is collapsed by default',()=>{
  const m=html.match(/<details\b[^>]*id="developer-panel"[^>]*>/);
  assert.ok(m,'developer panel missing');
  assert.ok(!/\sopen(?:\s|=|>)/.test(m[0]),'developer panel must not default open');
});

test('virtual controller exposes all eight NES buttons',()=>{
  const pads=[...html.matchAll(/data-pad="([A-Z]+)"/g)].map(m=>m[1]);
  assert.deepEqual(new Set(pads),new Set(['A','B','SELECT','START','UP','DOWN','LEFT','RIGHT']));
});

test('mobile portrait and landscape layouts are both present',()=>{
  assert.ok(html.includes('@media (max-width:720px)'));
  assert.ok(html.includes('orientation:landscape'));
  assert.ok(html.includes('env(safe-area-inset-bottom)'));
});

test('production browser does not run self-tests and debug tracing is URL opt-in',()=>{
  assert.ok(!app.includes('runSelfTests'));
  assert.ok(app.includes("new URLSearchParams(location.search).has('debug')"));
  assert.ok(app.includes('new NESMachine({developmentTracing:debugMode})'));
});

test('virtual controller handles multi-touch pointer lifecycle',()=>{
  for(const event of ['pointerdown','pointerup','pointercancel','lostpointercapture'])assert.ok(app.includes(`'${event}'`),event);
  assert.ok(app.includes('activePointers=new Map()'));
  assert.ok(app.includes('keyboardHeld|touchHeld'));
});

console.log(`\n${passed}/6 P6 UI tests passed`);
