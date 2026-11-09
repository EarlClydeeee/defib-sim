'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { beatPhase, getRhythm, sampleWave, type RhythmId } from '@/lib/rhythms';

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const readMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => false;

export default function EcgMonitor({ rhythm, sync = false, shocks = 0, hidden = false, onR }: {
  rhythm: RhythmId; sync?: boolean; shocks?: number; hidden?: boolean; onR?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onR);
  const artifact = useRef(-100);
  const priorShocks = useRef(shocks);
  const reduced = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const [playOverride, setPlayOverride] = useState<boolean | null>(null);
  const playing = playOverride ?? !reduced;

  useEffect(() => { callback.current = onR; }, [onR]);
  useEffect(() => {
    if (priorShocks.current !== shocks) {
      artifact.current = performance.now() / 1000;
      priorShocks.current = shocks;
    }
  }, [shocks]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let frame = 0;
    let lastPhase = 0;
    let previousTime = performance.now() / 1000;
    let elapsed = 0;
    let lastBeatTime = 0;
    const pixelsPerSecond = 110;

    const draw = () => {
      const time = performance.now() / 1000;
      const delta = Math.min(time - previousTime, .1);
      previousTime = time;
      // Keep synchronization timing active even when the visual strip is paused.
      lastBeatTime += delta;
      const phase = beatPhase(rhythm, lastBeatTime);
      if (phase >= .4 && lastPhase < .4 && getRhythm(rhythm).rate > 0) callback.current?.();
      lastPhase = phase;
      if (playing) elapsed += delta;

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
      // A moving time window: every screen position receives a new sample each frame.
      // Prefill the window so a complete strip is visible immediately.
      const windowStart = elapsed;
      const sampleStep = 1; // Keep narrow QRS complexes visible at high heart rates.
      let previousPhase = beatPhase(rhythm, windowStart);
      for (let x = 0; x < width - sampleStep; x += sampleStep) {
        const sampleTime = windowStart + x / pixelsPerSecond;
        const value = sampleWave(rhythm, sampleTime);
        const nextValue = sampleWave(rhythm, sampleTime + sampleStep / pixelsPerSecond);
        ctx.strokeStyle = value > .85 ? '#c8102e' : '#1b1a17';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, height * .58 - value * height * .27);
        ctx.lineTo(x + sampleStep, height * .58 - nextValue * height * .27);
        ctx.stroke();
        const currentPhase = beatPhase(rhythm, sampleTime);
        if (sync && getRhythm(rhythm).rate > 0 && previousPhase < .4 && currentPhase >= .4) {
          ctx.fillStyle = '#0f766e';
          ctx.beginPath();
          ctx.moveTo(x - 4, 30);
          ctx.lineTo(x + 4, 30);
          ctx.lineTo(x, 39);
          ctx.fill();
        }
        previousPhase = currentPhase;
      }
      if (time - artifact.current < .55) {
        ctx.strokeStyle = '#c8102e';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(width - 40, height * .6);
        ctx.lineTo(width - 30, 10);
        ctx.lineTo(width - 20, height - 10);
        ctx.lineTo(width - 10, height * .6);
        ctx.stroke();
        if (!reduced && playing) {
          ctx.fillStyle = 'rgba(255,255,255,.45)';
          ctx.fillRect(0, 0, width, height);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rhythm, sync, playing, reduced]);

  const r = getRhythm(rhythm);
  return <section className="monitor" aria-label={hidden ? 'Unlabeled simulated ECG strip' : `${r.name} ECG`}>
    <div className="monitor-top">
      <span>LEAD II <span className="live-dot" /> {playing ? 'LIVE STRIP' : 'STRIP PAUSED'}</span>
      <span>{sync ? '\u25BC SYNC MARKERS ON' : '25 mm/s \u00B7 10 mm/mV'}</span>
      <button type="button" className="strip-playback" onClick={() => setPlayOverride(!playing)} aria-label={playing ? 'Pause ECG strip' : 'Play ECG strip'}>{playing ? 'Pause strip' : 'Play strip'}</button>
    </div>
    {!playing && reduced && <p className="strip-motion-note">Reduced motion is on. Select Play strip to animate the ECG.</p>}
    <div className="ecg-paper"><canvas ref={canvas} role="img" aria-label={hidden ? 'Identify this ECG using the choices below' : `Simulated ${r.name} waveform`} /></div>
    <div className="monitor-bottom"><span>{hidden ? 'Identify the rhythm' : r.name}</span><span className="rate">{hidden ? '\u2014' : r.rate || '\u2014'} <small>bpm</small></span></div>
  </section>;
}
