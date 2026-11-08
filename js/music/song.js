// Song helpers: turn song data into notes with pitches, words and lines. No DOM.
import { nameToMidi } from './notes.js';

/**
 * Prepare a song for practice.
 * transpose: semitones to shift every note (e.g. -12 = an octave down).
 * Returns { ...song, notes: [{ i, beat, dur, end, midi, syl, word, line }], lines: [{ ..., end, lastNote, text }] }
 */
export function prepareSong(song, { transpose = 0 } = {}) {
  const notes = song.notes.map((n, i) => ({
    i, beat: n.beat, dur: n.dur, end: n.beat + n.dur,
    midi: nameToMidi(n.name) + transpose, syl: n.syl, word: '', line: 0,
  }));
  // Whole words for each syllable (for messages like "on 'grace'")
  let wordStart = 0;
  notes.forEach((n, i) => {
    if (!n.syl) { n.word = notes[i - 1] ? notes[i - 1].word : ''; return; }
    if (i === 0 || !notes[wordStart].syl.endsWith('-') || i === wordStart) wordStart = i;
    const parts = [];
    for (let j = wordStart; j < notes.length; j++) {
      if (!notes[j].syl) continue;
      parts.push(notes[j].syl.replace(/-$/, ''));
      if (!notes[j].syl.endsWith('-')) break;
    }
    n.word = parts.join('').replace(/[!?,.;:]+$/, '');
    if (!n.syl.endsWith('-')) wordStart = i + 1;
  });
  const lines = song.lines.map((l, k) => {
    const next = song.lines[k + 1];
    const lastNote = next ? next.firstNote - 1 : notes.length - 1;
    for (let j = l.firstNote; j <= lastNote; j++) notes[j].line = k;
    const text = notes.slice(l.firstNote, lastNote + 1).map((n) => n.syl).filter(Boolean)
      .map((s) => s.endsWith('-') ? s.slice(0, -1) + '\u0000' : s + ' ').join('').replace(/\u0000/g, '').trim();
    return { ...l, index: k, end: notes[lastNote].end, lastNote, text };
  });
  const midis = notes.map((n) => n.midi);
  return { ...song, notes, lines, low: Math.min(...midis), high: Math.max(...midis), transpose };
}

/** Count-in length (beats) so the clicks start on a downbeat and the music starts at `beat`. */
export function countInBeats(song, beat) {
  const inBar = (((beat - song.pickup) % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar;
  return song.beatsPerBar + inBar;
}

/** True if `beat` (a whole number) is the first beat of a bar. */
export const isDownbeat = (song, beat) => (((beat - song.pickup) % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar === 0;

/** Short label for a line, e.g. "Verse 1, line 3". */
export const lineLabel = (l) => `Verse ${l.verse}, line ${l.lineInVerse}`;

/** Pick the octave shift (-12, 0, +12) that best fits a sung range { low, high } (MIDI numbers). */
export function bestOctave(song, range) {
  if (!range) return 0;
  const midis = song.notes.map((n) => nameToMidi(n.name));
  let best = 0, bestOut = Infinity;
  for (const shift of [0, -12, 12]) {
    const out = midis.reduce((s, m) => s + Math.max(0, range.low - (m + shift), (m + shift) - range.high), 0);
    if (out < bestOut - 1e-9) { bestOut = out; best = shift; }
  }
  return best;
}
