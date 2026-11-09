import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(file, dependencies) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { exports, require: id => dependencies[id] });
  return exports;
}
const rhythms = loadTs('../lib/rhythms.ts', {});
const { initialState, reducer } = loadTs('../lib/defib-machine.ts', { './rhythms': rhythms });

function chargeAndClear(state) {
  let s = reducer(state, { type: 'CHARGE', now: 1 });
  s = reducer(s, { type: 'READY', now: 2 });
  for (const index of [0, 1, 2]) s = reducer(s, { type: 'CLEAR', index });
  return s;
}

let s = reducer(initialState('svt'), { type: 'SYNC' });
s = chargeAndClear(s);
assert.equal(s.phase, 'charged', 'Capacitor stores the selected energy');
s = reducer(s, { type: 'SHOCK', now: 3 });
assert.equal(s.phase, 'waitingForR', 'SYNC delays discharge until an R wave');
assert.equal(s.shocks, 0, 'No energy is delivered before the R wave');
s = reducer(s, { type: 'R_WAVE', now: 4 });
assert.equal(s.shocks, 1);
assert.equal(s.lastShockSynced, true, 'Discharge is marked as delivered on the R wave');
assert.equal(s.rhythm, 'standstill', 'Simultaneous depolarization causes a brief electrical pause');
assert.equal(s.sync, false, 'SYNC resets after discharge');
assert.equal(reducer(s, { type: 'CHARGE', now: 5 }).phase, 'discharged', 'Cannot recharge during the post-shock sequence');
s = reducer(s, { type: 'RECOVER', now: 6 });
assert.equal(s.rhythm, 'recovery', 'SA node fires first after the pause');
s = reducer(s, { type: 'SETTLE', now: 7 });
assert.equal(s.rhythm, 'nsr', 'Sinus rhythm is re-established');
assert.equal(s.conversion, null);

let unsynced = reducer(chargeAndClear(initialState('svt')), { type: 'SHOCK', now: 3 });
assert.equal(unsynced.rhythm, 'vf', 'Unsynchronized shock on SVT demonstrates R-on-T');
assert.equal(unsynced.lastShockSynced, false);
assert.equal(reducer(unsynced, { type: 'RECOVER', now: 4 }).rhythm, 'vf', 'No recovery sequence after R-on-T');

let defib = chargeAndClear(reducer(initialState('vf'), { type: 'ENERGY', value: 200 }));
defib = reducer(defib, { type: 'SHOCK', now: 3 });
assert.equal(defib.rhythm, 'standstill', 'Successful defibrillation also passes through the pause');
assert.equal(defib.conversion, 'defibrillation');

assert.ok(!rhythms.rhythms.some(r => rhythms.isPostShock(r.id)), 'Post-shock stages are not selectable rhythms');
console.log('Passed: charge, R-wave sync delay, electrical pause, SA node recovery, NSR, and R-on-T.');
