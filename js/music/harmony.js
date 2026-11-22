// Harmony and key helpers. Pure functions, no DOM.

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const mod = (a, n) => ((a % n) + n) % n;

/** "G" / "Bb" / "F#" -> pitch class 0..11 */
export function pitchClass(name) {
  const m = /^([A-G])([#♯b♭]?)/.exec(name);
  return mod(PC[m[1]] + (m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0), 12);
}

/** Key name after shifting: keyName({tonic:'G',mode:'major'}, -3) -> "E major" */
export function keyName(key, shift = 0) {
  return `${KEY_NAMES[mod(pitchClass(key.tonic) + shift, 12)]} ${key.mode}`;
}

/**
 * Move a note `steps` steps along the song's scale (2 = a third up, -2 = a third down).
 * Notes outside the scale move with the nearest scale note below them.
 */
export function diatonicShift(midi, steps, key) {
  const tonic = pitchClass(key.tonic), scale = SCALES[key.mode] || SCALES.major;
  const rel = midi - tonic;
  const oct = Math.floor(rel / 12), pc = mod(rel, 12);
  let i = scale.length - 1;
  while (i > 0 && scale[i] > pc) i--;
  const extra = pc - scale[i];                 // 0 for notes in the scale
  const pos = oct * 7 + i + steps;
  return tonic + Math.floor(pos / 7) * 12 + scale[mod(pos, 7)] + extra;
}

/** The harmony parts OnKey can make from a melody (room for more types later). */
export const HARMONIES = [
  { id: 'above', label: 'Harmony above', short: 'a third above', steps: 2 },
  { id: 'below', label: 'Harmony below', short: 'a third below', steps: -2 },
];

/**
 * Best shift (semitones) of `midis` from `shifts` to sit inside a comfortable range { low, high }:
 * notes outside the range cost most (above it double: straining up is worse than a low note);
 * then prefer the middle of the range, a little low; then the smallest change.
 */
export function bestShift(midis, range, shifts) {
  if (!range || !midis.length) return 0;
  const lo = Math.min(...midis), hi = Math.max(...midis), mid = (lo + hi) / 2;
  const aim = (range.low + range.high) / 2 - 1;
  let best = 0, bestCost = Infinity;
  for (const s of shifts) {
    const out = midis.reduce((t, m) => t + Math.max(0, range.low - (m + s), 2 * ((m + s) - range.high)), 0);
    const cost = out * 10 + Math.abs(mid + s - aim) + Math.abs(s) * 0.01;
    if (cost < bestCost - 1e-9) { bestCost = cost; best = s; }
  }
  return best;
}
export const OCTAVE_SHIFTS = [0, -12, 12];
export const KEY_SHIFTS = Array.from({ length: 25 }, (_, i) => i - 12); // a full octave either way
