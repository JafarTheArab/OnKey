// Simple piano accompaniment from chord symbols: bass note on beat 1, chord on the other beats.
// Pure functions, no DOM.
import { pitchClass } from './harmony.js';

const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7] };

/** "Em" -> { root: 4, tones: [0,3,7] } */
export function parseChord(sym) {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym);
  return { root: pitchClass(m[1]), tones: QUALITY[m[2]] || QUALITY[''] };
}

/** Place pitch class `pc` in [lo, lo+11]. */
const place = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12);

/**
 * chords: [{ beat, dur, sym }] (dur in beats); keyShift: semitones.
 * Returns note events [{ beat, dur, midi, vel }] for the piano, kept in a comfortable piano register.
 */
export function accompaniment(chords, { beatsPerBar = 3, keyShift = 0 } = {}) {
  const ev = [];
  for (const c of chords) {
    if (!c.sym) continue;
    const { root, tones } = parseChord(c.sym);
    const r = (root + keyShift + 120) % 12;
    const bass = place(r, 40);                              // E2..E♭3
    const chord = tones.map((t) => place((r + t) % 12, 55)).sort((a, b) => a - b); // G3..F#4, close position
    if (c.last) { // final chord: bass and chord together, left to ring
      ev.push({ beat: c.beat, dur: c.dur * 0.98, midi: bass, vel: 0.9 });
      for (const m of chord) ev.push({ beat: c.beat, dur: c.dur * 0.98, midi: m, vel: 0.6 });
      continue;
    }
    for (let b = 0; b < c.dur; b++) {
      const beat = c.beat + b, inBar = b % beatsPerBar;
      if (inBar === 0) ev.push({ beat, dur: Math.min(c.dur - b, beatsPerBar) * 0.95, midi: bass, vel: 0.9 });
      else for (const m of chord) ev.push({ beat, dur: 0.9, midi: m, vel: 0.55 });
    }
  }
  return ev;
}
