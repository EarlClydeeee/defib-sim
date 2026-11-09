import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(file, dependencies, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require: id => dependencies[id], ...globals });
  return exports;
}
const rhythms = loadTs('../lib/rhythms.ts', {});
function monitor({ rhythm = 'svt', reduced = false, override = null, sync = false } = {}) {
  let now = 0;
  let pending;
  let strokes = [];
  let fills = 0;
  let beats = 0;
  const effects = [];
  const ctx = {
    setTransform() {}, clearRect() { strokes = []; fills = 0; }, beginPath() {},
    moveTo(x, y) { strokes.push([x, y]); }, lineTo() {}, stroke() {}, fill() { fills++; }, fillRect() {},
  };
  const canvas = { clientWidth: 700, clientHeight: 260, width: 0, height: 0, getContext: () => ctx };
  const react = {
    useRef: value => ({ current: value === null ? canvas : value }),
    useEffect: callback => effects.push(callback),
    useState: () => [override, () => {}],
    useSyncExternalStore: () => reduced,
  };
  const { default: Component } = loadTs('../components/EcgMonitor.tsx', {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/lib/rhythms': rhythms,
  }, {
    performance: { now: () => now }, window: { devicePixelRatio: 1.25 },
    requestAnimationFrame: callback => { pending = callback; return 1; }, cancelAnimationFrame() {},
  });
  Component({ rhythm, sync, onR: () => beats++ });
  effects.forEach(effect => effect());
  return {
    tick(ms) { now += ms; pending(); return JSON.stringify(strokes); },
    get beats() { return beats; }, get fills() { return fills; }, canvas,
  };
}
for (const { id } of rhythms.rhythms) {
  const strip = monitor({ rhythm: id });
  const first = strip.tick(16);
  assert.notEqual(strip.tick(100), first, `${id}: live waveform must advance between frames`);
  assert.equal(strip.canvas.width, 875, 'Canvas backing size follows device pixel ratio');
}
const paused = monitor({ reduced: true });
assert.equal(paused.tick(16), paused.tick(100), 'Reduced motion starts with a stationary trace');
const resumed = monitor({ reduced: true, override: true });
assert.notEqual(resumed.tick(16), resumed.tick(100), 'Play overrides reduced-motion default');
const manualPause = monitor({ override: false });
assert.equal(manualPause.tick(16), manualPause.tick(100), 'Manual pause freezes the strip');
for (let i = 0; i < 60; i++) manualPause.tick(16);
assert.ok(manualPause.beats > 0, 'Pausing visuals must not stop synchronization timing');
const synchronized = monitor({ sync: true });
synchronized.tick(16);
assert.ok(synchronized.fills > 0, 'SYNC markers render on the strip');
const vf = monitor({ rhythm: 'vf', sync: true });
for (let i = 0; i < 60; i++) vf.tick(16);
assert.equal(vf.beats, 0, 'VF must not produce R-wave triggers');
console.log('Passed: 11 live rhythms, DPI sizing, reduced motion, play/pause, sync markers, and R-wave timing.');
