import { getRhythm, type RhythmId } from './rhythms';
export type Phase = 'idle'|'charging'|'charged'|'waitingForR'|'discharged'|'dumped';
export type LogEntry = {at:number; text:string};
export type State = {rhythm:RhythmId; phase:Phase; sync:boolean; energy:number; waveform:'Biphasic'|'Monophasic'; clear:boolean[]; chargedAt:number; shocks:number; log:LogEntry[]; feedback:string};
export type Event = {type:'RHYTHM';id:RhythmId}|{type:'SYNC'}|{type:'ENERGY';value:number}|{type:'WAVEFORM';value:State['waveform']}|{type:'CLEAR';index:number}|{type:'CHARGE'|'READY'|'SHOCK'|'R_WAVE'|'DUMP';now:number}|{type:'RESET';id:RhythmId};
export const initialState = (rhythm:RhythmId='svt'):State => ({rhythm,phase:'idle',sync:false,energy:100,waveform:'Biphasic',clear:[false,false,false],chargedAt:0,shocks:0,log:[],feedback:'Assess the patient. Choose a mode and energy, then charge.'});
export function outcome(s:State):{rhythm:RhythmId;text:string} {
 const r=getRhythm(s.rhythm);
 if(r.treatment==='Do not shock') return {rhythm:s.rhythm,text:'Inappropriate shock. '+r.note};
 if(r.treatment==='Synchronized cardioversion' && !s.sync) return {rhythm:'vf',text:'R-on-T risk: an unsynchronized shock can trigger VF. This teaching simulation demonstrates that complication. Begin CPR and prepare unsynchronized defibrillation.'};
 const target=s.waveform==='Biphasic'?r.biphasic:r.monophasic;
 if(s.energy<target) return {rhythm:s.rhythm,text:'Energy below this exercise’s initial target. Rhythm persists; reassess and escalate per device guidance.'};
 return {rhythm:'nsr',text:r.treatment==='Defibrillate'?'Simulated organized rhythm after shock. Resume CPR immediately for 2 minutes; assess pulse at the scheduled rhythm check. An organized tracing alone does not establish ROSC.':'Simulated conversion to sinus rhythm. Reassess pulse, blood pressure, and symptoms.'};
}
function discharge(s:State,now:number):State {const o=outcome(s); const text=o.text+' SYNC reset to OFF; re-enable before further cardioversion.'; return {...s,rhythm:o.rhythm,phase:'discharged',sync:false,clear:[false,false,false],shocks:s.shocks+1,feedback:text,log:[...s.log,{at:now,text:`${s.energy} J ${s.waveform}, ${s.sync?'SYNC':'UNSYNC'}: ${text}`} ]};}
export function reducer(s:State,e:Event):State {
 if(e.type==='RESET')return initialState(e.id);
 const locked=['charging','charged','waitingForR'].includes(s.phase);
 if(e.type==='RHYTHM')return locked?s:{...initialState(e.id),log:s.log};
 if(e.type==='SYNC')return locked?s:{...s,sync:!s.sync,clear:[false,false,false]};
 if(e.type==='ENERGY')return locked || ![50,100,120,150,200,360].includes(e.value) || (e.value===360&&s.waveform==='Biphasic')?s:{...s,energy:e.value};
 if(e.type==='WAVEFORM')return locked?s:{...s,waveform:e.value,energy:e.value==='Biphasic'&&s.energy===360?200:s.energy};
 if(e.type==='CLEAR')return s.phase==='waitingForR'?s:{...s,clear:s.clear.map((v,i)=>i===e.index?!v:v)};
 if(e.type==='CHARGE')return locked?s:{...s,phase:'charging',clear:[false,false,false],feedback:'Charging. Confirm the team and oxygen are clear.',log:[...s.log,{at:e.now,text:`Charging to ${s.energy} J.`}]};
 if(e.type==='READY')return s.phase==='charging'?{...s,phase:'charged',chargedAt:e.now,feedback:'Charged. Complete all three safety checks before discharge.'}:s;
 if(e.type==='DUMP')return locked?{...s,phase:'dumped',clear:[false,false,false],feedback:'Stored energy dumped. Reassess and recharge when ready.',log:[...s.log,{at:e.now,text:'Energy dumped; no shock delivered.'}]}:s;
 if(e.type==='SHOCK') {
  if(s.phase!=='charged'||!s.clear.every(Boolean))return s;
  if(s.sync)return {...s,phase:'waitingForR',feedback:'Waiting for a detected R wave. If synchronization delays critical treatment, follow emergency device guidance; disarm to change mode.'};
  return discharge(s,e.now);
 }
 if(e.type==='R_WAVE'&&s.phase==='waitingForR'&&getRhythm(s.rhythm).rate>0)return discharge(s,e.now);
 return s;
}
