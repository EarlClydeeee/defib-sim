export type RhythmId = 'nsr' | 'brady' | 'svt' | 'afib' | 'flutter' | 'vt' | 'pvt' | 'vf' | 'finevf' | 'asystole' | 'pea' | 'standstill' | 'recovery';
export type Treatment = 'Defibrillate' | 'Synchronized cardioversion' | 'Do not shock';
export type Rhythm = { id: RhythmId; name: string; rate: number; pulse: boolean; treatment: Treatment; biphasic: number; monophasic: number; note: string };
export const rhythms: Rhythm[] = [
  {id:'nsr',name:'Normal sinus rhythm',rate:75,pulse:true,treatment:'Do not shock',biphasic:0,monophasic:0,note:'Regular rhythm with a P wave before each narrow QRS. Assess the patient; no electrical therapy indicated.'},
  {id:'brady',name:'Sinus bradycardia',rate:38,pulse:true,treatment:'Do not shock',biphasic:0,monophasic:0,note:'Assess perfusion. Symptomatic bradycardia calls for the bradycardia pathway, including medication or pacing.'},
  {id:'svt',name:'Supraventricular tachycardia',rate:190,pulse:true,treatment:'Synchronized cardioversion',biphasic:100,monophasic:100,note:'Regular narrow-complex tachycardia. This exercise assumes instability. Synchronize and verify markers on every R wave; sedate when feasible.'},
  {id:'afib',name:'Atrial fibrillation with RVR',rate:156,pulse:true,treatment:'Synchronized cardioversion',biphasic:200,monophasic:200,note:'Irregularly irregular QRS complexes without discrete P waves. Unstable AFib: synchronized cardioversion at 200 J initially.'},
  {id:'flutter',name:'Atrial flutter',rate:150,pulse:true,treatment:'Synchronized cardioversion',biphasic:200,monophasic:200,note:'Sawtooth atrial activity. For unstable flutter, the 2025 AHA algorithm specifies an initial synchronized 200 J shock.'},
  {id:'vt',name:'Monomorphic VT with a pulse',rate:170,pulse:true,treatment:'Synchronized cardioversion',biphasic:100,monophasic:100,note:'Regular broad complexes with a pulse. If unstable, synchronize at 100 J initially. Always assess the pulse.'},
  {id:'pvt',name:'Pulseless ventricular tachycardia',rate:180,pulse:false,treatment:'Defibrillate',biphasic:200,monophasic:360,note:'Broad-complex tachycardia without a pulse. Defibrillate without synchronization and resume CPR immediately.'},
  {id:'vf',name:'Coarse ventricular fibrillation',rate:0,pulse:false,treatment:'Defibrillate',biphasic:200,monophasic:360,note:'Chaotic ventricular activity. Defibrillate promptly, then resume CPR for 2 minutes. Use manufacturer-recommended biphasic energy (often 120–200 J); if unknown, use maximum available.'},
  {id:'finevf',name:'Fine ventricular fibrillation',rate:0,pulse:false,treatment:'Defibrillate',biphasic:200,monophasic:360,note:'Low-amplitude chaotic activity. Confirm the tracing and connections; confirmed VF is shockable regardless of amplitude.'},
  {id:'asystole',name:'Asystole',rate:0,pulse:false,treatment:'Do not shock',biphasic:0,monophasic:0,note:'Confirm leads, gain, and another lead. Start high-quality CPR, give epinephrine per protocol, and address reversible causes.'},
  {id:'pea',name:'Pulseless electrical activity',rate:65,pulse:false,treatment:'Do not shock',biphasic:0,monophasic:0,note:'Organized electrical activity without a pulse. ECG alone cannot diagnose PEA. CPR, epinephrine, and reversible causes are priorities.'},
];
// Post-shock stages: shown on the monitor after a successful shock, never offered as selectable rhythms.
export const postShockRhythms: Rhythm[] = [
  {id:'standstill',name:'Post-shock electrical pause',rate:0,pulse:false,treatment:'Do not shock',biphasic:0,monophasic:0,note:'The shock depolarized every myocardial cell at once, interrupting the re-entry circuit. All electrical activity briefly stops while the cells repolarize. Watch for the SA node to fire first.'},
  {id:'recovery',name:'SA node recovery',rate:48,pulse:true,treatment:'Do not shock',biphasic:0,monophasic:0,note:'The SA node, the fastest natural pacemaker, recovers first and regains control. Slow sinus beats with a P wave before each QRS emerge, then the rate settles into normal sinus rhythm.'},
];
export const isPostShock = (id: RhythmId) => postShockRhythms.some(r => r.id === id);
export const getRhythm = (id: RhythmId) => [...rhythms, ...postShockRhythms].find(r => r.id === id)!;
const g = (x: number, center: number, width: number, height: number) => height * Math.exp(-(((x-center)/width)**2));
export function beatPhase(id: RhythmId, t: number) {
  const r = getRhythm(id);
  const clock = id === 'afib' ? t + .055*Math.sin(t*3.7) + .035*Math.sin(t*7.1) : t;
  return ((clock * r.rate / 60) % 1 + 1) % 1;
}
export function sampleWave(id: RhythmId, t: number): number {
  const p = beatPhase(id,t);
  if(id === 'asystole') return .008*Math.sin(t*17);
  if(id === 'standstill') return .005*Math.sin(t*13);
  if(id === 'vf' || id === 'finevf') return (id === 'vf' ? .36 : .09)*(Math.sin(t*31)+.48*Math.sin(t*47)+.3*Math.sin(t*73));
  if(id === 'vt' || id === 'pvt') return g(p,.38,.13,1)-g(p,.61,.12,.65);
  const qrs = g(p,.4,.018,1.15)-g(p,.36,.018,.2)-g(p,.44,.023,.32);
  const atrial = id === 'afib' ? .035*Math.sin(t*65) : id === 'flutter' ? .14*(1-2*((t*5)%1)) : id === 'svt' ? 0 : g(p,.19,.045,.14);
  return qrs + atrial + g(p,.69,.075,.25);
}
