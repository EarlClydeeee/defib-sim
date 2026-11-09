import {rhythms} from './rhythms';
export const questions=rhythms.map(r=>({rhythm:r.id,answer:r.treatment,context:r.pulse?'A pulse is present. For tachyarrhythmias, assume hypotension and symptoms attributable to the rhythm.':'The patient is unresponsive and has no pulse.'}));
