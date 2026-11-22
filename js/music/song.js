// Song helpers: turn song data into notes with pitches, words and lines. No DOM.
import { nameToMidi } from './notes.js';
import { diatonicShift, HARMONIES, keyName, bestShift, OCTAVE_SHIFTS } from './harmony.js';
import { accompaniment } from './accomp.js';

export const PART_LABELS = { melody: 'Melody', ...Object.fromEntries(HARMONIES.map((h) => [h.id, h.label])) };

/** The written notes (MIDI) of one part: 'melody', or a harmony made from it in the song's key. */
export function partMidis(song, part = 'melody') {
  const base = song.notes.map((n) => nameToMidi(n.name));
  if (part === 'melody') return base;
  const h = HARMONIES.find((x) => x.id === part);
  return base.map((m) => diatonicShift(m, h.steps, song.key));
}

/**
 * Prepare a song for practice.
 * part: which line is yours ('melody', 'above', 'below').
 * keyShift: semitones the whole song moves (Fit my voice); transpose: extra shift of YOUR part only
 * (the octave option: -12 = you sing an octave down while the others stay put).
 * Returns { ...song, notes (your part): [{ i, beat, dur, end, midi, syl, word, line }],
 *   others: [{ id, label, midis }] (the other voices), accomp: piano events, lines, keyLabel, ... }
 */
export function prepareSong(song, { part = 'melody', keyShift = 0, transpose = 0 } = {}) {
  const mine = partMidis(song, part);
  const notes = song.notes.map((n, i) => ({
    i, beat: n.beat, dur: n.dur, end: n.beat + n.dur,
    midi: mine[i] + keyShift + transpose, syl: n.syl, word: '', line: 0,
  }));
  // The other voices, where the rest of the group would sing them
  const others = ['melody', ...HARMONIES.map((h) => h.id)].filter((id) => id !== part)
    .map((id) => ({ id, label: PART_LABELS[id], midis: partMidis(song, id).map((m) => m + keyShift) }));
  // Singing the melody in another octave: the "leader" sings it as written
  if (part === 'melody' && transpose) {
    others.unshift({ id: 'lead', label: 'Melody as written (like the leader)', midis: partMidis(song).map((m) => m + keyShift) });
  }
  const accomp = accompaniment(song.chords || [], { beatsPerBar: song.beatsPerBar, keyShift });
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
  return { ...song, notes, lines, others, accomp, part, keyShift, transpose,
    keyLabel: keyName(song.key, keyShift), low: Math.min(...midis), high: Math.max(...midis) };
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

/** Pick the octave shift (-12, 0, +12) that best fits a comfortable range { low, high }. */
export function bestOctave(song, range, part = 'melody') {
  return bestShift(partMidis(song, part), range, OCTAVE_SHIFTS);
}
