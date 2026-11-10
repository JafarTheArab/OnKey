// Scoring and breakdown on simulated singing of Amazing Grace (verse 1).
import { prepareSong } from '../js/music/song.js';
import { evaluateNote, summarize, tolerance, troubleLine } from '../js/practice/scoring.js';
import { bestOctave } from '../js/music/song.js';
import raw from '../js/songs/amazing-grace.js';

const song = prepareSong(raw, { transpose: -12 });
const spb = 60 / raw.bpm;
const verse1 = song.notes.filter((n) => n.line <= 3);

// Make 30 ms voice frames for each note. fn(note, fracThroughNote) -> cents offset (or null = silent)
function sing(fn, { scoop = 0, vibrato = 30 } = {}) {
  const frames = [];
  for (const n of verse1) {
    const steps = Math.floor((n.dur * spb) / 0.03);
    for (let k = 0; k < steps; k++) {
      const t = k / steps, sec = k * 0.03;
      let c = fn(n, t);
      if (c == null) { frames.push({ beat: n.beat + t * n.dur, midi: null }); continue; }
      if (sec < 0.12) c += scoop * (1 - sec / 0.12);
      c += vibrato * Math.sin(2 * Math.PI * 5.5 * sec) * Math.min(1, sec / 0.3);
      frames.push({ beat: n.beat + t * n.dur, midi: n.midi + c / 100 });
    }
  }
  return frames;
}
function run(frames, tol = 30) {
  const attempts = verse1.map((n) => ({ i: n.i, res: evaluateNote(n, frames.filter((f) => f.beat >= n.beat && f.beat < n.end), spb) }));
  return summarize(song, attempts, { tol, secPerBeat: spb });
}
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const has = (s, kind, re) => s.findings.some((f) => f.kind === kind && re.test(f.text));
const show = (s) => s.findings.map((f) => '      · ' + f.text).join('\n');

let s = run(sing(() => 0));
check('on pitch scores high', s.score >= 95 && s.onPitch === s.total, `score=${s.score} ${s.onPitch}/${s.total}`);
check('on pitch: centred', has(s, 'overall', /centred/));

s = run(sing(() => -30));
check('30 cents flat: forgiving score but honest', s.score >= 60 && s.score < 100 && has(s, 'overall', /flat: on average 30% of a step low/), `score=${s.score}`);
console.log(show(s));

s = run(sing((n, t) => (n.dur >= 4 ? -40 * t : 0)));
check('drifts flat on long notes', has(s, 'drift', /drifted flat on the long notes \(‘me’, ‘see’\)/));
console.log(show(s));

s = run(sing((n) => { const p = song.notes[n.i - 1]; return p && n.midi - p.midi >= 3 ? 40 : 0; }));
check('sharp after jumps up', has(s, 'jump', /sharp after jumps up/));
console.log(show(s));

s = run(sing(() => -1200));
check('octave down counts, and is reported', s.score >= 95 && has(s, 'octave', /octave below/), `score=${s.score}`);

s = run(sing(() => 0, { scoop: -150 }));
check('scoop at note start is ignored for score', s.score >= 90, `score=${s.score}`);
check('scooping reported', has(s, 'scoop', /slide up into notes/));

s = run(sing((n) => (n.line === 2 ? -80 : 0)));
check('hardest line found', has(s, 'line', /Hardest line: “I once was lost/));
console.log(show(s));

s = run(sing((n) => (n.line === 1 ? null : 0)));
check('silent line: missed notes reported', has(s, 'missed', /didn’t hear you clearly on 7 notes/) && s.missed === 7);

s = run(sing(() => null));
check('silence: says it couldn’t hear', s.score === 0 && has(s, 'missed', /only heard you on 0/));

check('tolerance starts at base', tolerance('normal', []) === 30 && tolerance('gentle', [10]) === 45);
check('tolerance tightens as you improve', tolerance('normal', [10, 8, 9]) === 19 && tolerance('normal', [15, 14]) === 27, `${tolerance('normal', [10, 8, 9])} ${tolerance('normal', [15, 14])}`);

const hist = {}; for (const n of song.notes) hist[n.i] = n.line === 5 ? [0.1, 0.2, 0.3] : [0.9, 1, 1];
const tr = troubleLine(song, hist);
check('trouble spot from history', tr && tr.line === 5, JSON.stringify(tr));

check('octave choice: baritone sings it an octave down', bestOctave(raw, { low: 45, high: 64 }) === -12);
check('octave choice: alto sings as written', bestOctave(raw, { low: 55, high: 74 }) === 0);
check('octave choice: Justin’s first result (A2 to E♭5) still sings it an octave down', bestOctave(raw, { low: 45, high: 75 }) === -12);
check('octave choice: G2 to G5 (reach saved as comfortable) still an octave down', bestOctave(raw, { low: 43, high: 79 }) === -12);
process.exit(fail ? 1 : 0);
