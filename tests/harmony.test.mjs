// Stage 1b music helpers: harmony parts in key, other voices, piano chords, Fit my voice.
import { prepareSong, partMidis, bestOctave } from '../js/music/song.js';
import { diatonicShift, bestShift, KEY_SHIFTS, keyName } from '../js/music/harmony.js';
import { midiName } from '../js/music/notes.js';
import raw from '../js/songs/amazing-grace.js';
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const G = { tonic: 'G', mode: 'major' }, inG = (m) => [0, 2, 4, 6, 7, 9, 11].includes(((m - 7) % 12 + 12) % 12) || [7, 9, 11, 0, 2, 4, 6].includes(((m % 12) + 12) % 12);
const names = (ms) => ms.map(midiName).join(' ');

check('third above in G: D→F♯, G→B, B→D, E→G', names([62, 67, 71, 64].map((m) => diatonicShift(m, 2, G))) === 'F♯4 B4 D5 G4');
check('third below in G: D→B, G→E, B→G, A→F♯', names([62, 67, 71, 69].map((m) => diatonicShift(m, -2, G))) === 'B3 E4 G4 F♯4');
const scale = [7, 9, 11, 0, 2, 4, 6];
for (const p of ['above', 'below']) check(`harmony ${p} stays in the key of G`, partMidis(raw, p).every((m) => scale.includes(((m % 12) + 12) % 12)));

const mel = prepareSong(raw, { part: 'melody', transpose: -12 });
check('melody an octave down: other voices include the melody as written (the leader)', mel.others[0].id === 'lead' && mel.others[0].midis[0] === 62 && mel.notes[0].midi === 50);
const below = prepareSong(raw, { part: 'below' });
check('singing harmony below: others are melody and harmony above', below.others.map((o) => o.id).join() === 'melody,above');
check('piano chords: first bar is G major (G bass, G B D)', names(below.accomp.filter((e) => e.beat === 1 || e.beat === 2).map((e) => e.midi)) === 'G2 G3 B3 D4');
check('piano: nothing on the pickup beat', !below.accomp.some((e) => e.beat === 0));

const r = { low: 47, high: 72 }; // Justin: B2 to C5
for (const p of ['melody', 'above', 'below']) {
  const ks = bestShift(partMidis(raw, p), r, KEY_SHIFTS), s = prepareSong(raw, { part: p, keyShift: ks });
  check(`Fit my voice (${p}): every note inside B2..C5`, s.low >= r.low && s.high <= r.high, `${keyName(G, ks)}, ${midiName(s.low)}–${midiName(s.high)}`);
}
const ks = bestShift(partMidis(raw), r, KEY_SHIFTS), fit = prepareSong(raw, { keyShift: ks });
check('Fit my voice moves the piano and other voices too', fit.accomp[0].midi !== below.accomp[0].midi && fit.others[0].midis[0] === partMidis(raw, 'above')[0] + ks);
check('octave choice for harmony above (B2..C5): down', bestOctave(raw, r, 'above') === -12);
process.exit(fail ? 1 : 0);
