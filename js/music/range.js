// Voice range helpers. Pure functions, no DOM.
import { midiName } from './notes.js';

/**
 * Find steady held notes in a stream of { t (ms), midi } frames.
 * Returns [{ midi (median), start, end }] for every stretch of at least `minMs`
 * where the pitch stays within ±0.6 semitones of its running median.
 */
export function steadyHolds(frames, minMs = 900) {
  const holds = [];
  let run = [];
  const flush = () => {
    if (run.length && run[run.length - 1].t - run[0].t >= minMs) {
      const s = run.map((f) => f.midi).sort((a, b) => a - b);
      holds.push({ midi: s[Math.floor(s.length / 2)], start: run[0].t, end: run[run.length - 1].t });
    }
    run = [];
  };
  for (const f of frames) {
    if (f.midi == null) { if (run.length && f.t - run[run.length - 1].t > 150) flush(); continue; }
    if (run.length) {
      const s = run.slice(-10).map((x) => x.midi).sort((a, b) => a - b);
      if (Math.abs(f.midi - s[Math.floor(s.length / 2)]) > 0.6) flush();
    }
    run.push(f);
  }
  flush();
  return holds;
}

/** Lowest and highest reliable pitch in a slide (ignores the outer 5% as likely misreadings). */
export function slideExtent(frames) {
  const m = frames.filter((f) => f.midi != null).map((f) => f.midi).sort((a, b) => a - b);
  if (m.length < 15) return null;
  return { low: m[Math.floor(m.length * 0.05)], high: m[Math.ceil(m.length * 0.95) - 1] };
}

// Typical comfortable ranges, by where the middle of your range sits
const TYPES = [
  [50.5, 'bass'], [55, 'baritone'], [59, 'tenor'], [63.5, 'alto'], [67, 'mezzo-soprano'], [Infinity, 'soprano'],
];
export function voiceType(low, high) {
  const mid = (low + high) / 2;
  return TYPES.find(([lim]) => mid < lim)[1];
}

/** "about A2 to E4, a baritone range" */
export function describeRange(r) {
  if (!r) return 'not tested yet';
  const t = voiceType(r.low, r.high);
  return `about ${midiName(r.low)} to ${midiName(r.high)}, ${/^[aeiou]/.test(t) ? 'an' : 'a'} ${t} range`;
}
