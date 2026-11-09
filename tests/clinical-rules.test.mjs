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
const machine = loadTs('../lib/defib-machine.ts', { './rhythms': rhythms });
const { gradeCase, criticalCap } = loadTs('../lib/scoring.ts', { './rhythms': rhythms, './defib-machine': machine });
const scenarios = loadTs('../lib/scenarios.ts', {}).scenarios;
const { initialState, reducer } = machine;

const run = (state, ...events) => events.reduce((s, e) => reducer(s, typeof e === 'string' ? { type: e, now: 1 } : e), state);
const setup = (rhythm, { sync = false, energy, waveform } = {}) => {
  let s = initialState(rhythm);
  if (waveform) s = run(s, { type: 'WAVEFORM', value: waveform });
  if (energy) s = run(s, { type: 'ENERGY', value: energy });
  if (sync) s = run(s, { type: 'SYNC' });
  return s;
};
const charge = s => run(s, 'CHARGE', 'READY', { type: 'CLEAR', index: 0 }, { type: 'CLEAR', index: 1 }, { type: 'CLEAR', index: 2 });
const shock = s => { const next = run(charge(s), 'SHOCK'); return next.phase === 'waitingForR' ? run(next, 'R_WAVE') : next; };
const grade = (rhythm, s, extra = {}) => gradeCase({ rhythm, recognition: rhythm, elapsed: 10, shock: s.lastShock, flags: s.flags, withheld: false, ...extra });
const assertFail = (g, label) => { assert.equal(g.passed, false, `${label}: must fail`); assert.ok(g.score <= criticalCap, `${label}: score ${g.score} must be capped`); assert.ok(g.critical.length > 0, `${label}: needs a critical reason`); };

// ERR-01 / ERR-02 / ERR-13: shocks on nonshockable rhythms
for (const id of ['asystole', 'pea', 'nsr', 'brady']) {
  const s = shock(setup(id));
  assert.match(s.feedback, /Inappropriate shock|withheld/, `${id}: shock must be flagged`);
  assert.notEqual(s.rhythm, 'standstill', `${id}: must not "convert"`);
  if (s.lastShock) assertFail(grade(id, s), `${id} shocked`);
  assert.equal(rhythms.advisory(rhythms.getRhythm(id)).badge, 'NON-SHOCKABLE', `${id}: advisory`);
}
const asystoleSync = shock(setup('asystole', { sync: true }));
assert.equal(asystoleSync.shocks, 0, 'ERR-01: SYNC ON asystole never discharges');
assertFail(grade('asystole', asystoleSync, { withheld: true }), 'ERR-01 attempted shock then withheld');
assert.equal(grade('asystole', initialState('asystole'), { withheld: true }).score, 100, 'Withholding on asystole earns full credit');

// ERR-03 / ERR-06 / F-01: unsynchronized shock on a rhythm with a pulse
assert.equal(initialState('svt').sync, false, 'F-01: device starts SYNC OFF, like many real devices');
for (const id of ['svt', 'vt', 'afib', 'flutter']) {
  const s = shock(setup(id, { energy: 200 }));
  assert.equal(s.rhythm, 'vf', `${id}: unsynced shock demonstrates R-on-T`);
  assert.match(s.feedback, /Wrong mode/, `${id}: wrong mode is named`);
  assertFail(grade(id, s), `${id} unsynchronized`);
}

// ERR-04: pulseless VT / VF with SYNC ON must not be accepted
for (const id of ['pvt', 'vf']) {
  const s = shock(setup(id, { sync: true, energy: 200 }));
  assert.equal(s.shocks, 0, `${id}: SYNC ON must not deliver a "successful" defibrillation`);
  assert.equal(s.phase, 'charged', `${id}: stays charged so the learner can correct the mode`);
  assert.match(s.feedback, /Turn SYNC OFF/);
  const fixed = run(s, { type: 'SYNC' }, { type: 'CLEAR', index: 0 }, { type: 'CLEAR', index: 1 }, { type: 'CLEAR', index: 2 }, 'SHOCK');
  assert.equal(fixed.rhythm, 'standstill', `${id}: SYNC OFF then shock defibrillates`);
  const g = grade(id, fixed);
  assert.ok(g.passed && g.score < 100, `${id}: delayed by SYNC ON costs points (${g.score})`);
}

// ERR-05: AF at 50 or 100 J is not the recommended starting dose
for (const energy of [50, 100]) {
  const s = shock(setup('afib', { sync: true, energy }));
  assert.equal(s.rhythm, 'afib', `AF at ${energy} J must not convert`);
  assert.match(s.feedback, /at least 200 J/);
  const g = grade('afib', s);
  assert.ok(g.lines.some(l => /below the initial dose/.test(l)) && g.score <= 80, `AF ${energy} J loses energy credit`);
}
assert.match(rhythms.energyRange.afib.biphasic, /200 J or more/, 'F-02: AF range states the 200 J minimum');
assert.equal(grade('afib', shock(setup('afib', { sync: true, energy: 200 }))).score, 100, 'AF 200 J synced scores 100');
assert.equal(grade('svt', shock(setup('svt', { sync: true, energy: 100 }))).score, 100, 'SVT 100 J synced scores 100');

// ERR-07: no routine pulse check before resuming CPR after defibrillation
let vf = shock(setup('vf', { energy: 200 }));
assert.match(vf.feedback, /Resume CPR immediately/);
assert.doesNotMatch(vf.feedback, /check (for )?a pulse now|pulse check now/i);
vf = run(vf, 'RECOVER', 'SETTLE');
assert.match(vf.feedback, /Continue CPR until the 2-minute rhythm check/);
assert.match(rhythms.advisory(rhythms.getRhythm('vf')).prep, /No pulse check/);

// ERR-08: SYNC resets after each cardioversion and the learner is told to re-verify
let twice = shock(setup('afib', { sync: true, energy: 100 }));
assert.equal(twice.sync, false, 'ERR-08: SYNC resets to OFF after discharge');
assert.match(twice.feedback, /Re-enable it and confirm a marker/);
twice = shock(run(twice, { type: 'ENERGY', value: 200 }));
assert.equal(twice.rhythm, 'vf', 'ERR-08: second shock without re-enabling SYNC is unsynchronized');

// ERR-09: incomplete checklist blocks the shock
const partial = run(setup('vf', { energy: 200 }), 'CHARGE', 'READY', { type: 'CLEAR', index: 0 }, 'SHOCK');
assert.equal(partial.shocks, 0, 'ERR-09: no discharge with incomplete checklist');

// ERR-10: no discharge without charging
assert.equal(run(setup('vf', { energy: 200 }), 'SHOCK').shocks, 0, 'ERR-10: shock without charge does nothing');
assert.equal(run(setup('vf', { energy: 200 }), 'CHARGE', 'SHOCK').shocks, 0, 'ERR-10: shock while still charging does nothing');

// ERR-11: energy cannot change after charging
const charged = charge(setup('vf', { energy: 120 }));
const tried = run(charged, { type: 'ENERGY', value: 200 }, { type: 'WAVEFORM', value: 'Monophasic' }, 'SHOCK');
assert.equal(tried.lastShock.energy, 120, 'ERR-11: delivered energy equals charged energy');
assert.equal(tried.lastShock.waveform, 'Biphasic');

// ERR-12: sedation recommended when feasible for cardioversion
assert.match(rhythms.advisory(rhythms.getRhythm('svt')).prep, /Sedate .* when feasible/);
for (const id of ['post-op-svt', 'unstable-afib', 'wide-complex']) assert.match(scenarios.find(c => c.id === id).debrief, /[Ss]edate when feasible/, `${id} debrief`);

// ERR-14: fine VF is shockable
const fine = shock(setup('finevf', { energy: 200 }));
assert.equal(rhythms.getRhythm('finevf').treatment, 'Defibrillate');
assert.equal(fine.rhythm, 'standstill', 'ERR-14: fine VF can be defibrillated');

// ERR-15: inappropriate therapy never earns full credit; withholding needed therapy fails
assertFail(grade('vf', initialState('vf'), { withheld: true }), 'VF withheld');
assertFail(grade('svt', initialState('svt'), { withheld: true }), 'SVT withheld');

// F-03: energy targets follow the selected waveform
assert.equal(machine.targetEnergy('vf', 'Monophasic'), 360);
assert.equal(machine.targetEnergy('vf', 'Biphasic'), 200);
assert.equal(setup('vf', { energy: 360 }).energy, 100, 'F-03: 360 J unavailable on biphasic');
const mono200 = shock(setup('vf', { waveform: 'Monophasic', energy: 200 }));
assert.equal(mono200.rhythm, 'vf', 'F-03: 200 J monophasic is below the 360 J monophasic dose');
assert.ok(grade('vf', mono200).score < 100);
assert.equal(grade('vf', shock(setup('vf', { waveform: 'Monophasic', energy: 360 }))).score, 100);

console.log('Passed: ERR-01 to ERR-15, F-01, F-02, F-03 clinical rule checks.');
