// Amazing Grace.
// Words: John Newton, 1779 (public domain). Tune: NEW BRITAIN, American folk melody first printed 1829
// (public domain). This note-by-note arrangement was written for OnKey; it copies no published edition.
// Written in G major, 3/4, with a one-beat pickup. Durations are in beats (quarter notes).

// The tune for one verse: [beats, note, syllable slot] where slot -1 = same syllable held over (a slur)
const TUNE = [
  [1, 'D4', 0], [2, 'G4', 1], [0.5, 'B4', 2], [0.5, 'G4', -1], [2, 'B4', 3], [1, 'A4', 4], [2, 'G4', 5], [1, 'E4', 6], [2, 'D4', 7],
  [1, 'D4', 8], [2, 'G4', 9], [0.5, 'B4', 10], [0.5, 'G4', -1], [2, 'B4', 11], [1, 'A4', 12], [5, 'D5', 13],
  [1, 'B4', 14], [2, 'D5', 15], [0.5, 'B4', 16], [0.5, 'G4', -1], [2, 'B4', 17], [1, 'A4', 18], [2, 'G4', 19], [1, 'E4', 20], [2, 'D4', 21],
  [1, 'D4', 22], [2, 'G4', 23], [0.5, 'B4', 24], [0.5, 'G4', -1], [2, 'B4', 25], [1, 'A4', 26], [5, 'G4', 27],
];
// Where each of the 4 lines starts (index into TUNE)
const LINE_STARTS = [0, 9, 16, 25];

// Syllables; a trailing "-" means the word continues on the next syllable
const VERSES = [
  'A- maz- ing grace! How sweet the sound | That saved a wretch like me! | I once was lost, but now am found; | Was blind, but now I see.',
  '’Twas grace that taught my heart to fear, | And grace my fears re- lieved; | How pre- cious did that grace ap- pear | The hour I first be- lieved!',
  'Through ma- ny dan- gers, toils and snares, | I have al- read- y come; | ’Tis grace hath brought me safe thus far, | And grace will lead me home.',
];

function build() {
  const notes = [], lines = [];
  let beat = 0;
  VERSES.forEach((text, v) => {
    const syl = text.replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
    const last = v === VERSES.length - 1;
    TUNE.forEach(([dur, name, slot], i) => {
      const li = LINE_STARTS.indexOf(i);
      if (li >= 0) lines.push({ start: beat, firstNote: notes.length, verse: v + 1, lineInVerse: li + 1 });
      // "see" is held 5 beats so the next verse's pickup fits the bar; the very last note gets the full bar
      const d = i === TUNE.length - 1 && last ? dur + 1 : dur;
      notes.push({ beat, dur: d, name, syl: slot >= 0 ? syl[slot] : '' });
      beat += d;
    });
  });
  return { notes, lines, length: beat };
}

const { notes, lines, length } = build();

export default {
  id: 'amazing-grace',
  title: 'Amazing Grace',
  credit: 'Words: John Newton (1779). Tune: NEW BRITAIN, American folk melody (1829). Public domain; arrangement written for OnKey.',
  bpm: 84,
  beatsPerBar: 3,
  pickup: 1,          // beats before the first full bar
  key: { tonic: 'G', mode: 'major' },
  notes,              // { beat, dur, name, syl }
  lines,              // { start, firstNote, verse, lineInVerse }
  length,
};
