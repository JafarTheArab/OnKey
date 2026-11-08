// Scoring: a forgiving score, plus exact, honest details. Pure functions, no DOM.
// Frames are { beat, midi } already corrected for timing delay.

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const FRAME_SEC = 0.03;

export const STRICTNESS = {
  gentle: { label: 'Gentle', base: 45, floor: 25 },
  normal: { label: 'Normal', base: 30, floor: 18 },
  strict: { label: 'Strict', base: 18, floor: 12 },
};

/**
 * On-pitch window in cents. Starts at the strictness level's base and tightens
 * as your recent typical error shrinks (never looser than the base).
 */
export function tolerance(strictness = 'normal', recentAvgAbs = []) {
  const s = STRICTNESS[strictness] || STRICTNESS.normal;
  const recent = recentAvgAbs.filter((x) => x != null).slice(-3);
  if (recent.length < 2) return s.base;
  return Math.round(Math.min(s.base, Math.max(s.floor, 1.5 * mean(recent) + 5)));
}

/**
 * Judge one note from the voice frames that fall inside it.
 * Scores only the steady middle: skips the scoop at the start and the release at the end.
 */
export function evaluateNote(note, frames, secPerBeat) {
  const durSec = note.dur * secPerBeat;
  const skip = Math.min(0.3 * durSec, 0.15) / secPerBeat;
  const trim = (0.1 * durSec) / secPerBeat;
  const a = note.beat + skip, b = note.end - trim;
  const steady = [], early = [];
  for (const f of frames) {
    if (f.midi == null || f.beat < note.beat || f.beat >= note.end) continue;
    const c = (f.midi - note.midi) * 100;
    if (f.beat >= a && f.beat < b) steady.push({ beat: f.beat, c });
    else if (f.beat < a) early.push(c);
  }
  const expected = Math.max(1, ((b - a) * secPerBeat) / FRAME_SEC);
  const coverage = Math.min(1, steady.length / expected);
  if (steady.length < 2) return { coverage, sung: false };
  // Octave: singing a whole octave away from the bar counts for the score, but we say so
  const octave = Math.round(median(steady.map((s) => s.c)) / 1200);
  const folded = steady.map((s) => s.c - octave * 1200);
  const err = median(folded);
  const res = { coverage, sung: coverage >= 0.15, err: Math.round(err), octave, n: steady.length };
  if (durSec >= 2 && steady.length >= 15) {
    const half = Math.floor(folded.length / 2);
    res.drift = Math.round(median(folded.slice(half)) - median(folded.slice(0, half)));
  }
  if (early.length >= 2) res.scoop = Math.round(median(early.map((c) => c - octave * 1200)) - err);
  return res;
}

/** 0..1 credit for one judged note. */
export function noteCredit(res, tol) {
  if (!res || !res.sung) return 0;
  const e = Math.abs(res.err);
  const acc = e <= tol ? 1 : Math.max(0, 1 - (e - tol) / (2 * tol));
  return acc * Math.min(1, res.coverage / 0.5);
}

const weight = (n) => Math.sqrt(Math.max(0.5, n.dur));
const q = (w) => `‘${w}’`;
const list = (words) => [...new Set(words)].slice(0, 3).map(q).join(', ');
const cents = (c) => `${Math.abs(Math.round(c))} cent${Math.abs(Math.round(c)) === 1 ? '' : 's'}`;
const dir = (c) => (c < 0 ? 'flat' : 'sharp');

/**
 * Summarise a run.
 * song: prepared song; attempts: [{ i (note index), res }] (latest attempt per note is used);
 * returns { score, onPitch, sungCount, total, missed, avgSigned, avgAbs, octave, findings: [{ kind, text, good? }], perNote, lineScores }
 */
export function summarize(song, attempts, { tol, secPerBeat }) {
  const latest = new Map();
  for (const a of attempts) latest.set(a.i, a.res);
  const judged = [...latest.entries()].map(([i, res]) => ({ n: song.notes[i], res, credit: noteCredit(res, tol) }))
    .sort((x, y) => x.n.i - y.n.i);
  const total = judged.length;
  if (!total) return { score: 0, total: 0, findings: [], perNote: [], lineScores: [] };
  const wsum = judged.reduce((s, j) => s + weight(j.n), 0);
  const score = Math.round((100 * judged.reduce((s, j) => s + j.credit * weight(j.n), 0)) / wsum);
  const sung = judged.filter((j) => j.res.sung);
  const missed = judged.filter((j) => !j.res.sung);
  const onPitch = sung.filter((j) => Math.abs(j.res.err) <= tol).length;
  const avgSigned = sung.length ? Math.round(mean(sung.map((j) => j.res.err))) : 0;
  const avgAbs = sung.length ? Math.round(mean(sung.map((j) => Math.abs(j.res.err)))) : null;
  const octaves = sung.map((j) => j.res.octave);
  const octave = octaves.length ? Math.round(median(octaves)) : 0;
  const F = [];
  const add = (kind, text, extra = {}) => F.push({ kind, text, ...extra });

  if (sung.length < Math.max(3, total * 0.3)) {
    add('missed', `OnKey only heard you on ${sung.length} of ${total} notes, so there isn’t much to go on. Sing a bit louder, or check the mic is the iPhone’s (Mic check on the home screen).`);
  } else {
    // 1. Overall lean
    if (Math.abs(avgSigned) >= 8) add('overall', `Overall you sat a little ${dir(avgSigned)}: on average ${cents(avgSigned)} ${avgSigned < 0 ? 'under' : 'over'} the notes.`);
    else add('overall', `Overall you were centred on the notes (on average ${cents(avgSigned)} ${dir(avgSigned)}).`, { good: true });

    // 2. Octave
    if (octave !== 0 && octaves.filter((o) => o === octave).length >= sung.length * 0.6) {
      add('octave', `You sang most of it an octave ${octave < 0 ? 'below' : 'above'} the bars. That still counts, but you can move the bars to your octave in Options › Octave.`);
    }

    // 3. Long notes: drifting while holding
    const longs = sung.filter((j) => j.res.drift != null);
    if (longs.length >= 2) {
      const d = mean(longs.map((j) => j.res.drift));
      const worst = longs.filter((j) => Math.sign(j.res.drift) === Math.sign(d) && Math.abs(j.res.drift) >= 10);
      if (Math.abs(d) >= 12 && worst.length >= 2) {
        add('drift', `You drifted ${dir(d)} on the long notes (${list(worst.map((j) => j.n.word))}): you ${d < 0 ? 'sank' : 'crept up'} about ${cents(d)} by the end of each one. Keep the breath steady to the end of the note.`);
      } else if (Math.abs(d) < 8) add('drift', `You held the long notes steady (${list(longs.map((j) => j.n.word))}).`, { good: true });
    }

    // 4. After jumps
    const prevSung = (j) => song.notes[j.n.i - 1];
    for (const [up, label] of [[true, 'up'], [false, 'down']]) {
      const after = sung.filter((j) => { const p = prevSung(j); if (!p) return false; const iv = j.n.midi - p.midi; return up ? iv >= 3 : iv <= -3; });
      if (after.length >= 2) {
        const e = mean(after.map((j) => j.res.err));
        if (Math.abs(e - avgSigned) >= 12 && Math.abs(e) >= 15) {
          const ex = after.filter((j) => Math.sign(j.res.err) === Math.sign(e)).map((j) => j.n.word);
          add('jump', `You came in ${dir(e)} after jumps ${label} (like ${list(ex)}): about ${cents(e)} ${dir(e)}. Hear the new note in your head before you jump.`);
        }
      }
    }

    // 5. High vs low notes
    const span = song.high - song.low;
    if (span >= 5) {
      const hi = sung.filter((j) => j.n.midi >= song.high - span * 0.25);
      const lo = sung.filter((j) => j.n.midi <= song.low + span * 0.25);
      for (const [grp, name] of [[hi, 'high'], [lo, 'low']]) {
        if (grp.length < 2) continue;
        const e = mean(grp.map((j) => j.res.err));
        if (Math.abs(e) >= 15 && Math.abs(e - avgSigned) >= 10) {
          add('register', `Your ${name} notes ran ${dir(e)} (${list(grp.filter((j) => Math.sign(j.res.err) === Math.sign(e)).map((j) => j.n.word))}): about ${cents(e)} ${dir(e)}.`);
        }
      }
    }

    // 6. Scooping into notes
    // (ignore a slide that simply comes from the previous note: that's normal smooth singing)
    const scoops = sung.filter((j) => {
      if (j.res.scoop == null) return false;
      const p = song.notes[j.n.i - 1];
      return !p || p.end < j.n.beat || p.midi === j.n.midi || Math.sign(j.res.scoop) !== Math.sign(p.midi - j.n.midi);
    });
    if (scoops.length >= 4) {
      const s = median(scoops.map((j) => j.res.scoop));
      if (s <= -35) add('scoop', `You often slide up into notes from below (about ${cents(s)} under at the start). Try landing right on the note.`);
      else if (s >= 35) add('scoop', `You often start notes a little high and settle down (about ${cents(s)} over at the start).`);
    }

    // 7. Missed notes
    if (missed.length >= 3) {
      add('missed', `OnKey didn’t hear you clearly on ${missed.length} note${missed.length === 1 ? '' : 's'} (like ${list(missed.map((j) => j.n.word))}). That’s usually too quiet, or a breath.`);
    }
  }

  // Lines: best and hardest
  const lineScores = song.lines.map((l) => {
    const js = judged.filter((j) => j.n.line === l.index);
    if (!js.length) return null;
    const w = js.reduce((s, j) => s + weight(j.n), 0);
    return { line: l, score: Math.round((100 * js.reduce((s, j) => s + j.credit * weight(j.n), 0)) / w),
      onPitch: js.filter((j) => j.res.sung && Math.abs(j.res.err) <= tol).length, count: js.length };
  }).filter(Boolean);
  if (lineScores.length >= 2 && sung.length >= 3) {
    const sorted = [...lineScores].sort((a, b) => a.score - b.score);
    const worst = sorted[0], best = sorted[sorted.length - 1];
    if (best.score - worst.score >= 10) {
      add('line', `Hardest line: “${worst.line.text}” (${worst.onPitch} of ${worst.count} notes on pitch).`, { line: worst.line.index });
      add('line', `Strongest line: “${best.line.text}” (${best.onPitch} of ${best.count} on pitch).`, { good: true });
    }
  }

  const perNote = judged.map((j) => ({ i: j.n.i, word: j.n.word, syl: j.n.syl, line: j.n.line, sung: j.res.sung, err: j.res.err, credit: j.credit }));
  return { score, onPitch, sungCount: sung.length, total, missed: missed.length, avgSigned, avgAbs, octave, findings: F, perNote, lineScores };
}

/**
 * Trouble spots from past runs: noteHist maps note index -> recent credits (0..1).
 * Returns the line index most often missed, or null.
 */
export function troubleLine(song, noteHist) {
  let best = null;
  for (const l of song.lines) {
    const vals = [];
    for (let i = l.firstNote; i <= l.lastNote; i++) if (noteHist[i]) vals.push(...noteHist[i].slice(-4));
    if (vals.length < (l.lastNote - l.firstNote + 1) * 2) continue; // needs at least 2 tries
    const miss = 1 - mean(vals);
    if (miss > 0.35 && (!best || miss > best.miss)) best = { line: l.index, miss };
  }
  return best;
}
