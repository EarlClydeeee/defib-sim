import { getRhythm, type RhythmId } from './rhythms';
import { targetEnergy, type Flag, type Shock } from './defib-machine';

export type Grade = { score: number; passed: boolean; critical: string[]; lines: string[] };
export const criticalCap = 40;

export function gradeCase({ rhythm, recognition, elapsed, shock, flags, withheld }: {
  rhythm: RhythmId; recognition: string; elapsed: number; shock: Shock | null; flags: Flag[]; withheld: boolean;
}): Grade {
  const r = getRhythm(rhythm);
  const critical: string[] = [];
  const lines: string[] = [];
  let score = 0;

  if (recognition === rhythm) { score += 25; lines.push('Rhythm recognition: correct (+25).'); }
  else lines.push(`Rhythm recognition: incorrect or missing; this was ${r.name.toLowerCase()} (+0).`);

  if (r.treatment === 'Do not shock') {
    if (shock) critical.push(`A shock was delivered for ${r.name.toLowerCase()}, a nonshockable rhythm. It delays CPR and the treatment this patient needs.`);
    else if (flags.includes('attempted-nonshockable')) critical.push(`A shock was attempted for ${r.name.toLowerCase()}, a nonshockable rhythm. The device withheld it because no R waves were detected.`);
    else if (withheld) { score += 45 + 20; lines.push('Therapy: correctly withheld the shock (+45).', 'Energy: none delivered, which is correct (+20).'); }
  } else if (!shock) {
    critical.push(`Electrical therapy was withheld. ${r.name} requires ${r.treatment === 'Defibrillate' ? 'immediate unsynchronized defibrillation' : 'synchronized cardioversion'}.`);
  } else {
    const needsSync = r.treatment === 'Synchronized cardioversion';
    if (needsSync && !shock.synced) critical.push('Unsynchronized shock on a rhythm with a pulse. This risks R-on-T and VF; SYNC ON was required.');
    else if (!needsSync && flags.includes('sync-on-arrest')) { score += 30; lines.push('Therapy: unsynchronized defibrillation, but only after SYNC ON withheld the first attempt (+30 of 45). VF and pulseless VT need SYNC OFF.'); }
    else { score += 45; lines.push(`Therapy: ${needsSync ? 'synchronized cardioversion' : 'unsynchronized defibrillation'}, correct mode (+45).`); }
    const target = targetEnergy(rhythm, shock.waveform);
    if (shock.energy >= target) { score += 20; lines.push(`Energy: ${shock.energy} J ${shock.waveform.toLowerCase()} meets the initial dose of ${target} J (+20).`); }
    else lines.push(`Energy: ${shock.energy} J ${shock.waveform.toLowerCase()} is below the initial dose of ${target} J${rhythm === 'afib' ? ' (AHA 2025: at least 200 J biphasic for AF)' : ''} (+0).`);
  }

  if (elapsed <= 60) { score += 10; lines.push('Decision within the 60-second study target (+10).'); }
  else lines.push('Decision took longer than the 60-second study target. This is a study goal, not a clinical timing rule (+0).');

  const passed = critical.length === 0;
  return { score: passed ? score : Math.min(score, criticalCap), passed, critical, lines };
}
