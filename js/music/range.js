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
      holds.push({ midi: s[Math.floor(s.length / 2)], start: run[0].t, end: run[run.length - 1].t,
        dur: run[run.length - 1].t - run[0].t, ...steadiness(run) });
    }
    run = [];
  };
  for (const f of frames) {
    if (f.midi == null) { if (run.length && f.t - run[run.length - 1].t > 150) flush(); continue; }
    if (run.length) {
      const s = run.slice(-10).map((x) => x.midi).sort((a, b) => a - b);
      if (Math.abs(f.midi - s[Math.floor(s.length / 2)]) > 0.9) flush();
    }
    run.push(f);
  }
  flush();
  return holds;
}

/**
 * How steady a held note was (in semitones). Normal vibrato is averaged out first.
 * wander: how far the note drifted over the hold; shake: uneven wobble on top of that.
 */
export function steadiness(run) {
  // 0.3 s moving average (sliding window, so it stays fast on long holds)
  const avg = new Array(run.length);
  let lo = 0, hi = 0, sum = 0;
  for (let i = 0; i < run.length; i++) {
    while (hi < run.length && run[hi].t - run[i].t <= 150) sum += run[hi++].midi;
    while (run[i].t - run[lo].t > 150) sum -= run[lo++].midi;
    avg[i] = sum / (hi - lo);
  }
  const inner = avg.filter((_, i) => run[i].t - run[0].t >= 300 && run[run.length - 1].t - run[i].t >= 300);
  const use = inner.length >= 5 ? inner : avg;
  const wander = Math.max(...use) - Math.min(...use);
  const dev = run.map((f, i) => Math.abs(f.midi - avg[i])).sort((a, b) => a - b);
  const shake = dev[Math.floor(dev.length * 0.9)] || 0;
  return { wander, shake };
}

/** A held note counts as comfortable if it lasted ~2 s and stayed steady. */
export const isSteadyHold = (h) => h.dur >= 1800 && h.wander < 0.5 && h.shake < 0.6;

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

/** "about A2 to E4, a baritone range" (the comfortable range) */
export function describeRange(r) {
  if (!r) return 'not tested yet';
  const t = voiceType(r.low, r.high);
  return `about ${midiName(r.low)} to ${midiName(r.high)}, ${/^[aeiou]/.test(t) ? 'an' : 'a'} ${t} range`;
}

/** "A2 to E♭5" (everything you reached, even briefly) */
export const describeReach = (r) => (r && r.reachLow != null ? `${midiName(r.reachLow)} to ${midiName(r.reachHigh)}` : '');
