import { getRhythm, isPostShock, type RhythmId } from './rhythms';
export type Phase = 'idle'|'charging'|'charged'|'waitingForR'|'discharged'|'dumped';
export type LogEntry = {at:number; text:string};
export type Conversion = 'cardioversion'|'defibrillation';
export type Waveform = 'Biphasic'|'Monophasic';
export type Shock = {rhythm:RhythmId; energy:number; waveform:Waveform; synced:boolean};
export type Flag = 'sync-on-arrest'|'attempted-nonshockable';
export type State = {rhythm:RhythmId; phase:Phase; sync:boolean; energy:number; waveform:Waveform; clear:boolean[]; chargingAt:number; chargedAt:number; shocks:number; lastShock:Shock|null; lastShockSynced:boolean; conversion:Conversion|null; flags:Flag[]; log:LogEntry[]; feedback:string};
export type Event = {type:'RHYTHM';id:RhythmId}|{type:'SYNC'|'CLEAR_LOG'}|{type:'ENERGY';value:number}|{type:'WAVEFORM';value:Waveform}|{type:'CLEAR';index:number}|{type:'CHARGE'|'READY'|'SHOCK'|'R_WAVE'|'DUMP'|'RECOVER'|'SETTLE';now:number}|{type:'RESET';id:RhythmId};
export const initialState = (rhythm:RhythmId='svt'):State => ({rhythm,phase:'idle',sync:false,energy:100,waveform:'Biphasic',clear:[false,false,false],chargingAt:0,chargedAt:0,shocks:0,lastShock:null,lastShockSynced:false,conversion:null,flags:[],log:[],feedback:'Assess the patient. Choose a mode and energy, then charge.'});
export const chargeMs = 2400, pauseMs = 2200, recoveryMs = 4200;
export const targetEnergy = (id:RhythmId, waveform:Waveform) => { const r=getRhythm(id); return waveform==='Biphasic'?r.biphasic:r.monophasic; };
export function outcome(s:State):{rhythm:RhythmId;conversion:Conversion|null;text:string} {
 const r=getRhythm(s.rhythm);
 if(r.treatment==='Do not shock') return {rhythm:s.rhythm,conversion:null,text:`Inappropriate shock: ${r.name.toLowerCase()} is not a shockable rhythm. ${r.note}`};
 if(r.treatment==='Synchronized cardioversion' && !s.sync) return {rhythm:'vf',conversion:null,text:'Wrong mode: this rhythm has a pulse and requires SYNC ON. The unsynchronized shock landed on the T wave, during repolarization, and triggered VF (R-on-T). Begin CPR and defibrillate with SYNC OFF.'};
 const target=targetEnergy(s.rhythm,s.waveform);
 if(s.energy<target) return {rhythm:s.rhythm,conversion:null,text:`${s.energy} J is below the initial ${s.waveform.toLowerCase()} dose for ${r.name.toLowerCase()} (${target} J${s.rhythm==='afib'?'; AHA 2025: at least 200 J biphasic for AF':''}). Rhythm persists; reassess and escalate per device guidance.`};
 return r.treatment==='Defibrillate'
  ? {rhythm:'standstill',conversion:'defibrillation',text:'Shock delivered. The current depolarized the whole myocardium at once and terminated the chaotic activity: brief electrical standstill. Resume CPR immediately, starting with compressions. Do not pause for a pulse check; reassess at the 2-minute rhythm check.'}
  : {rhythm:'standstill',conversion:'cardioversion',text:'Shock delivered on the R wave, avoiding the vulnerable T wave. The current depolarized every myocardial cell at once and interrupted the re-entry circuit: brief electrical standstill.'};
}
function discharge(s:State,now:number):State {
 const o=outcome(s);
 const text=o.text+(s.sync?' SYNC has reset to OFF, as on many devices. Re-enable it and confirm a marker on every R wave before another cardioversion.':'');
 return {...s,rhythm:o.rhythm,phase:'discharged',sync:false,clear:[false,false,false],shocks:s.shocks+1,lastShock:{rhythm:s.rhythm,energy:s.energy,waveform:s.waveform,synced:s.sync},lastShockSynced:s.sync,conversion:o.conversion,feedback:text,log:[...s.log,{at:now,text:`${s.energy} J ${s.waveform}, ${s.sync?'SYNC':'UNSYNC'}: ${text}`}]};
}
const log=(s:State,now:number,text:string):State=>({...s,feedback:text,log:[...s.log,{at:now,text}]});
const flag=(s:State,f:Flag):Flag[]=>s.flags.includes(f)?s.flags:[...s.flags,f];
export function reducer(s:State,e:Event):State {
 if(e.type==='RESET')return initialState(e.id);
 if(e.type==='CLEAR_LOG')return {...s,log:[]};
 const locked=['charging','charged','waitingForR'].includes(s.phase);
 if(e.type==='RHYTHM')return locked?s:{...initialState(e.id),log:s.log};
 if(e.type==='SYNC')return s.phase==='charging'||s.phase==='waitingForR'?s:{...s,sync:!s.sync,clear:[false,false,false]};
 if(e.type==='ENERGY')return locked || ![50,100,120,150,200,360].includes(e.value) || (e.value===360&&s.waveform==='Biphasic')?s:{...s,energy:e.value};
 if(e.type==='WAVEFORM')return locked?s:{...s,waveform:e.value,energy:e.value==='Biphasic'&&s.energy===360?200:s.energy};
 if(e.type==='CLEAR')return s.phase==='waitingForR'?s:{...s,clear:s.clear.map((v,i)=>i===e.index?!v:v)};
 if(e.type==='CHARGE')return locked||isPostShock(s.rhythm)?s:{...s,phase:'charging',chargingAt:e.now,clear:[false,false,false],feedback:'Charging. Confirm the team and oxygen are clear.',log:[...s.log,{at:e.now,text:`Charging to ${s.energy} J.`}]};
 if(e.type==='READY')return s.phase==='charging'?{...s,phase:'charged',chargedAt:e.now,feedback:'Charged. Complete all three safety checks before discharge.'}:s;
 if(e.type==='DUMP')return locked?{...s,phase:'dumped',clear:[false,false,false],feedback:'Stored energy dumped. Reassess and recharge when ready.',log:[...s.log,{at:e.now,text:'Energy dumped; no shock delivered.'}]}:s;
 if(e.type==='SHOCK') {
  if(s.phase!=='charged'||!s.clear.every(Boolean))return s;
  const r=getRhythm(s.rhythm);
  if(s.sync&&r.treatment==='Defibrillate')return log({...s,flags:flag(s,'sync-on-arrest')},e.now,'Shock withheld: SYNC is ON, but VF and pulseless VT have no reliable R waves to synchronize to. Turn SYNC OFF and defibrillate now. Every delay lowers survival.');
  if(s.sync&&r.rate===0)return log({...s,flags:flag(s,'attempted-nonshockable')},e.now,`Shock withheld: no R waves detected. ${r.name} is not shockable. Disarm, resume CPR, and give epinephrine per protocol.`);
  if(s.sync)return {...s,phase:'waitingForR',feedback:'Waiting for a detected R wave. If synchronization delays critical treatment, follow emergency device guidance; disarm to change mode.'};
  return discharge(s,e.now);
 }
 if(e.type==='R_WAVE'&&s.phase==='waitingForR'&&getRhythm(s.rhythm).rate>0)return discharge(s,e.now);
 if(e.type==='RECOVER'&&s.rhythm==='standstill'&&s.conversion)return log({...s,rhythm:'recovery'},e.now,s.conversion==='defibrillation'
  ?'Organized activity emerging on the monitor. Keep doing CPR: rhythm and pulse are checked only at the 2-minute rhythm check.'
  :'SA node recovering: as the fastest natural pacemaker, it fires first after the pause. Slow sinus beats, each with a P wave before the QRS, are emerging.');
 if(e.type==='SETTLE'&&s.rhythm==='recovery')return log({...s,rhythm:'nsr',conversion:null},e.now,s.conversion==='defibrillation'
  ?'Organized rhythm on the monitor. Continue CPR until the 2-minute rhythm check, then check for a pulse. An organized tracing alone does not establish ROSC.'
  :'Normal sinus rhythm re-established. Reassess pulse, blood pressure, consciousness, and oxygenation. SYNC is OFF; re-enable it before any further cardioversion.');
 return s;
}
