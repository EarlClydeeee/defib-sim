'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { beatPhase, getRhythm, isPostShock, sampleWave, type RhythmId } from '@/lib/rhythms';

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const readMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => false;

const pixelsPerSecond = 110;
const spikeLength = .12;
const rPhase = .4;
type Segment = { start: number; rhythm: RhythmId };

function segmentAt(segments: Segment[], t: number) {
  for (let i = segments.length - 1; i > 0; i--) if (segments[i].start <= t) return segments[i];
  return segments[0];
}
function shockSpike(dt: number) {
  if (dt < .015) return dt / .015 * 1.7;
  if (dt < .035) return 1.7 - (dt - .015) / .02 * 3.1;
  return -1.4 * Math.exp(-(dt - .035) / .025);
}

export default function EcgMonitor({ rhythm, sync = false, shocks = 0, syncedShock = false, hidden = false, onR }: {
  rhythm: RhythmId; sync?: boolean; shocks?: number; syncedShock?: boolean; hidden?: boolean; onR?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onR);
  const reduced = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const [playOverride, setPlayOverride] = useState<boolean | null>(null);
  const playing = playOverride ?? !reduced;
  // One clock drives both the drawing and R-wave detection; its time is the strip's right edge.
  // `view` is the right edge actually drawn, and stays frozen while the strip is paused.
  const timeline = useRef({ clock: 0, view: 0, lastR: -10, segments: [{ start: 0, rhythm }] as Segment[], shockTimes: [] as number[], rhythm, shocks });
  const live = useRef({ sync, playing, reduced });

  useEffect(() => { callback.current = onR; }, [onR]);
  useEffect(() => { live.current = { sync, playing, reduced }; }, [sync, playing, reduced]);

  useEffect(() => {
    const line = timeline.current;
    const shocked = shocks !== line.shocks;
    const changed = rhythm !== line.rhythm;
    if (!shocked && !changed) return;
    let start = line.clock;
    if (shocked) {
      const at = syncedShock && line.clock - line.lastR < .25 ? line.lastR : line.clock;
      line.shockTimes = [...line.shockTimes.slice(-3), at];
      start = at + spikeLength;
    }
    if (changed) {
      if (shocked || isPostShock(rhythm) || isPostShock(line.rhythm)) {
        // Hand over at the end of the current beat so no complex is cut in half.
        const current = segmentAt(line.segments, line.clock);
        const rate = getRhythm(current.rhythm).rate;
        if (!shocked && rate > 0) start = line.clock + (1 - beatPhase(current.rhythm, line.clock - current.start)) * 60 / rate;
        line.segments = [...line.segments.filter(s => s.start < start).slice(-4), { start, rhythm }];
      } else {
        line.segments = [{ start: line.clock, rhythm }];
      }
    }
    line.rhythm = rhythm;
    line.shocks = shocks;
    line.view = line.clock;
  }, [rhythm, shocks, syncedShock]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let frame = 0;
    let previousTime = performance.now() / 1000;
    let beatSegment: Segment | null = null;
    let lastPhase = 0;

    const draw = () => {
      const time = performance.now() / 1000;
      const delta = Math.min(time - previousTime, .1);
      previousTime = time;
      const line = timeline.current;
      const { sync, playing, reduced } = live.current;
      line.clock += delta;
      if (playing) line.view = line.clock;

      const current = segmentAt(line.segments, line.clock);
      const rate = getRhythm(current.rhythm).rate;
      const phase = beatPhase(current.rhythm, line.clock - current.start);
      if (current === beatSegment && rate > 0 && lastPhase < rPhase && phase >= rPhase) {
        line.lastR = line.clock - (phase - rPhase) * 60 / rate;
        callback.current?.();
      }
      beatSegment = current;
      lastPhase = phase;

      const width = el.clientWidth;
      const height = el.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (el.width !== pixelWidth || el.height !== pixelHeight) {
        el.width = pixelWidth;
        el.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const windowStart = line.view - width / pixelsPerSecond;
      const valueAt = (t: number) => {
        const shock = line.shockTimes.find(at => t >= at && t < at + spikeLength);
        if (shock !== undefined) return shockSpike(t - shock);
        const segment = segmentAt(line.segments, t);
        return sampleWave(segment.rhythm, t - segment.start);
      };
      const sampleStep = 1; // Keep narrow QRS complexes visible at high heart rates.
      let previous = null as { segment: Segment; phase: number } | null;
      for (let x = 0; x < width - sampleStep; x += sampleStep) {
        const sampleTime = windowStart + x / pixelsPerSecond;
        const value = valueAt(sampleTime);
        const nextValue = valueAt(sampleTime + sampleStep / pixelsPerSecond);
        ctx.strokeStyle = Math.abs(value) > .85 ? '#c8102e' : '#1b1a17';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, height * .58 - value * height * .27);
        ctx.lineTo(x + sampleStep, height * .58 - nextValue * height * .27);
        ctx.stroke();
        const segment = segmentAt(line.segments, sampleTime);
        const samplePhase = beatPhase(segment.rhythm, sampleTime - segment.start);
        if (sync && previous?.segment === segment && getRhythm(segment.rhythm).rate > 0 && previous.phase < rPhase && samplePhase >= rPhase) {
          ctx.fillStyle = '#0f766e';
          ctx.beginPath();
          ctx.moveTo(x - 4, 30);
          ctx.lineTo(x + 4, 30);
          ctx.lineTo(x, 39);
          ctx.fill();
        }
        previous = { segment, phase: samplePhase };
      }
      const lastShock = line.shockTimes[line.shockTimes.length - 1];
      if (lastShock !== undefined && line.clock - lastShock < .35 && !reduced && playing) {
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.fillRect(0, 0, width, height);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const r = getRhythm(rhythm);
  return <section className="monitor" aria-label={hidden ? 'Unlabeled simulated ECG strip' : `${r.name} ECG`}>
    <div className="monitor-top">
      <span>LEAD II <span className="live-dot" /> {playing ? 'LIVE STRIP' : 'STRIP PAUSED'}</span>
      <span>GAIN 1.0x {'\u00B7'} 25 mm/s{sync && <b className="sync-flag"> {'\u25BC'} SYNC</b>}</span>
      <span className="hr">HR <b>{hidden || !r.rate ? '\u2014' : r.rate}</b> bpm</span>
      <button type="button" className="strip-playback" onClick={() => setPlayOverride(!playing)} aria-label={playing ? 'Pause ECG strip' : 'Play ECG strip'}>{playing ? 'Pause strip' : 'Play strip'}</button>
    </div>
    {!playing && reduced && <p className="strip-motion-note">Reduced motion is on. Select Play strip to animate the ECG.</p>}
    <div className="ecg-paper"><canvas ref={canvas} role="img" aria-label={hidden ? 'Identify this ECG using the choices below' : `Simulated ${r.name} waveform`} /></div>
    <div className="monitor-bottom"><span className="current-rhythm"><small>CURRENT RHYTHM</small>{hidden ? 'Identify the rhythm' : r.name}</span></div>
  </section>;
}
