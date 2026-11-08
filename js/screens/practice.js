// Practice screen: target bars scroll right to left toward the "now" line, your voice is drawn
// on the same graph, lyrics light up underneath, and you get a score plus an honest breakdown.
//
// Timing model: the music runs on the sound engine's clock. A list of "anchors" maps engine time to
// song beats (a new anchor whenever the speed changes or a repeated part jumps back). Everything you
// see and everything that's scored is shifted by your measured delay (Timing check), so your voice
// lines up with the notes you were answering.
import { Mic, preferPhoneMic } from '../audio/mic.js';
import { midiName, isNatural, stepPct, offWords } from '../music/notes.js';
import { prepareSong, countInBeats, isDownbeat, lineLabel, bestOctave } from '../music/song.js';
import { evaluateNote, noteCredit, summarize, tolerance, troubleLine, STRICTNESS } from '../practice/scoring.js';
import { makeBus, click, guideNote } from '../practice/sounds.js';
import { store } from '../store.js';

const $ = (id) => document.getElementById(id);
const LOOKAHEAD = 0.25;      // seconds of sound scheduled ahead
const VIEW_AHEAD = 6.5;      // seconds of music visible ahead of the now line
const NOW_X = 0.2;           // now line position (fraction of width)
const DEFAULT_LATENCY = 0.12;
const PITCH_LAG = 0.12;      // the pitch tracker's own smoothing delay (measured on synthetic singing)
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

let go, rawSong, song, S, prog;
let state = 'idle';          // idle | starting | playing | paused | done
let anchors = [], sched = null, schedTimer = null, bus = null, latency = DEFAULT_LATENCY;
let part = { from: 0, to: 0 }, repeat = false, pass = 0, speed = 1;
let frames = new Map();      // pass -> [{ beat, midi }]
let attempts = [];           // [{ i, pass, res }]
let evaluated = new Set();   // `${pass}:${i}`
let noteMark = new Map();    // note index -> 'ok' | 'near' | 'off' | 'miss' (latest, for bar colours)
let lineDone = new Set(), passScores = [], tol = 30, endedAt = null, toastTimer = null;
let headless = false;        // true when no earbuds seem connected (guide may leak into the mic)
let visible = false, displayBeat = null, displayAnchor = null;

const mic = new Mic({
  onFrame(r) {
    if (state !== 'playing' || !anchors.length) return;
    const at = beatAt(r.ct - latency - PITCH_LAG);
    if (!at) return;
    const arr = frames.get(at.a.pass) || [];
    frames.set(at.a.pass, arr);
    arr.push({ beat: at.beat, midi: r.midi, countIn: at.beat < at.a.songFrom });
    if (arr.length > 12000) arr.splice(0, 2000);
  },
  onStateChange(on, reason) {
    $('pMicBadge').hidden = !on;
    if (!on && (state === 'playing' || state === 'starting')) {
      pause(reason === 'background' ? 'Paused because OnKey went to the background. The mic is off.'
        : reason === 'ended' ? 'Paused: the iPhone took the microphone (a call or another app?).' : 'Paused.');
    }
  },
});

// ---------- timeline ----------
function beatAt(ct) {
  let a = null;
  for (let k = anchors.length - 1; k >= 0; k--) if (anchors[k].ct <= ct) { a = anchors[k]; break; }
  if (!a) return null;
  return { a, beat: a.beat + (ct - a.ct) * a.rate };
}
const ctOf = (a, beat) => a.ct + (beat - a.beat) / a.rate;
const rateFor = (sp) => (song.bpm / 60) * sp;
const secPerBeat = () => 60 / (song.bpm * speed);
const partStart = () => song.lines[part.from].start;
const partEnd = () => song.lines[part.to].end;

function newPassAnchor(ct, fromBeat) {
  pass++;
  const ci = countInBeats(song, fromBeat);
  const first = song.notes.find((n) => n.beat >= fromBeat);
  return { ct, beat: fromBeat - ci, rate: rateFor(speed), songFrom: fromBeat, pass, refMidi: first ? first.midi : null };
}

// ---------- sound scheduling ----------
function scheduleTick() {
  const ac = mic.ctx;
  if (!ac || state !== 'playing' || !sched) return;
  const horizon = ac.currentTime + LOOKAHEAD;
  let guard = 0;
  while (guard++ < 4) {
    const a = sched.a, end = partEnd();
    const target = a.beat + (horizon - a.ct) * a.rate;
    const upTo = Math.min(target, end);
    scheduleRange(ac, a, sched.beat, upTo);
    sched.beat = upTo;
    if (target < end) break;
    if (repeat) {
      const na = newPassAnchor(ctOf(a, end) + 0.15, partStart());
      anchors.push(na);
      sched = { a: na, beat: na.beat };
    } else { sched = null; break; }
  }
}

function scheduleRange(ac, a, b0, b1) {
  const s = store.settings();
  if (b1 <= b0) return;
  if (a.refMidi != null && b0 <= a.beat && a.beat < b1 && a.songFrom > a.beat) {
    // Starting note, played softly during the count-in so you know where to come in
    guideNote(ac, bus, ctOf(a, a.beat), Math.min(2, a.songFrom - a.beat - 1) / a.rate, a.refMidi, 0.8);
  }
  for (let k = Math.ceil(b0 - 1e-9); k < b1; k++) {
    const inCount = k < a.songFrom;
    if (inCount || s.metronome) click(ac, bus, ctOf(a, k), isDownbeat(song, k), inCount ? 1 : 0.6);
  }
  if (s.guide) {
    for (const n of song.notes) {
      if (n.beat >= b0 && n.beat < b1 && n.beat >= a.songFrom && n.beat < partEnd()) {
        guideNote(ac, bus, ctOf(a, n.beat), Math.max(0.08, n.dur / a.rate - 0.03), n.midi);
      }
    }
  }
}

function setSpeed(sp, why) {
  sp = Math.round(Math.max(0.5, Math.min(1.25, sp)) * 100) / 100;
  if (sp === speed) return;
  speed = sp;
  $('pSpeed').textContent = Math.round(sp * 100) + '%';
  if (state === 'playing' && sched) {
    const ct = ctOf(sched.a, sched.beat);
    const na = { ...sched.a, ct, beat: sched.beat, rate: rateFor(sp) };
    anchors.push(na);
    sched = { a: na, beat: sched.beat };
  }
  if (why) toast(why);
}

// ---------- start / pause / finish ----------
async function start(fromLine) {
  const s = store.settings();
  state = 'starting';
  $('pMsg').hidden = true; hidePanels();
  $('pPlay').textContent = 'Pause';
  try {
    await mic.start({ preferPhoneMic: preferPhoneMic() });
  } catch (e) {
    state = 'idle'; $('pPlay').textContent = 'Start';
    showMsg(e.name === 'NotAllowedError'
      ? 'Microphone permission was denied. In Settings › Safari › Microphone, allow access, then try again.'
      : 'The microphone didn’t start. Tap Start to try again.');
    return;
  }
  if (state !== 'starting') return; // paused meanwhile
  const ac = mic.ctx;
  bus = makeBus(ac);
  headless = !mic.hasOtherMic;
  latency = store.get().latency ?? DEFAULT_LATENCY;
  // Line the start up with when the mic opened (about 1.2 s later), so it's predictable
  const lead = Math.max(0.3, (mic.openedAt + 1200 - performance.now()) / 1000);
  const fromBeat = song.lines[fromLine].start;
  anchors = [newPassAnchor(ac.currentTime + lead, fromBeat)];
  sched = { a: anchors[0], beat: anchors[0].beat };
  endedAt = null;
  state = 'playing';
  $('pLive').hidden = false;
  scheduleTick();
  clearInterval(schedTimer);
  schedTimer = setInterval(() => { scheduleTick(); evaluateTick(); }, 25);
  if (headless && s.guide) toast('No earbuds detected: the guide melody may leak into the mic. Earbuds work best.', 5000);
}

function stopSound() {
  clearInterval(schedTimer); schedTimer = null;
  if (bus) { try { bus.disconnect(); } catch (_) {} bus = null; }
  sched = null;
}

function pause(msg) {
  if (state !== 'playing' && state !== 'starting') return;
  evaluateTick(true);
  stopSound();
  state = 'paused';
  if (mic.on) mic.stop();
  const cur = currentLine();
  rememberLine(cur);
  $('pPlay').textContent = 'Resume';
  $('pCount').hidden = true;
  showMsg(`${msg || 'Paused.'}`, [
    ['Resume from this line', () => resume(cur), 'primary'],
    ['See my score', () => finish()],
    ['Start over', () => restart()],
  ]);
}
function resume(line) { $('pMsg').hidden = true; start(Math.max(part.from, Math.min(part.to, line))); }
function restart() { resetRun(); $('pMsg').hidden = true; start(part.from); }

function currentLine() {
  const b = displayBeat ?? partStart();
  let li = part.from;
  for (let k = part.from; k <= part.to; k++) if (song.lines[k].start <= b + 0.01) li = k;
  return li;
}
function rememberLine(li) { prog.lastLine = li; store.saveSong(); }

function finish() {
  evaluateTick(true);
  stopSound();
  state = 'done';
  if (mic.on) mic.stop();
  $('pPlay').textContent = 'Start';
  $('pCount').hidden = true; $('pMsg').hidden = true;
  showResults();
}

function resetRun() {
  frames = new Map(); attempts = []; evaluated = new Set(); noteMark = new Map(); lineDone = new Set();
  passScores = []; pass = 0; anchors = []; displayBeat = null;
  $('pLive').hidden = true; $('pLive').textContent = '';
}

// ---------- judging notes as they pass ----------
function evaluateTick(final = false) {
  if (!anchors.length || !mic.ctx) return;
  const at = beatAt(mic.ctx.currentTime - latency - PITCH_LAG);
  if (!at) return;
  // Judge every note in passes that are finished, and notes whose end has passed in this one
  let changed = false;
  for (const a of anchors) {
    const p = a.pass;
    if (p > at.a.pass) continue; // scheduled ahead, not sung yet
    const cutoff = p < at.a.pass ? Infinity : final ? at.beat + 100 : at.beat - 0.05;
    for (const n of song.notes) {
      if (n.beat < a.songFrom || n.end > partEnd() + 1e-6 || n.end > cutoff) continue;
      if (final && p === at.a.pass && n.beat > at.beat) continue; // never reached
      const key = p + ':' + n.i;
      if (evaluated.has(key)) continue;
      evaluated.add(key); changed = true;
      const res = evaluateNote(n, (frames.get(p) || []).filter((f) => !f.countIn), secPerBeat());
      attempts.push({ i: n.i, pass: p, res });
      const c = noteCredit(res, tol);
      noteMark.set(n.i, !res.sung ? 'miss' : Math.abs(res.err) <= tol ? 'ok' : c > 0.4 ? 'near' : 'off');
      onLineProgress(p, n);
    }
  }
  if (changed) {
    const sum = summarize(song, attempts, { tol, secPerBeat: secPerBeat() });
    if (sum.total) $('pLive').textContent = sum.score;
  }
  // Song (or part) over?
  if (!repeat && !final && state === 'playing' && at.beat >= partEnd() + 0.4) finish();
  if (state === 'playing') rememberLine(currentLine());
}

function onLineProgress(p, n) {
  const l = song.lines[n.line];
  if (n.i !== l.lastNote) return;
  const key = p + ':' + l.index;
  if (lineDone.has(key)) return;
  lineDone.add(key);
  const js = attempts.filter((x) => x.pass === p && song.notes[x.i].line === l.index);
  const lineScore = js.reduce((s, x) => s + noteCredit(x.res, tol), 0) / Math.max(1, js.length);
  // Repeating a part: report each time through
  if (repeat && l.index === part.to) {
    const pj = attempts.filter((x) => x.pass === p);
    const sc = Math.round((100 * pj.reduce((s, x) => s + noteCredit(x.res, tol), 0)) / Math.max(1, pj.length));
    passScores.push(sc);
    toast(`Time ${passScores.length}: ${sc}${passScores.length > 1 ? (sc > passScores[passScores.length - 2] ? ' ↑' : '') : ''}`);
  }
  if (!store.settings().autoSpeed) return;
  const userSpeed = store.settings().speed;
  if (lineScore < 0.5 && speed > 0.6) setSpeed(speed - 0.1, `That line was tricky: slowing to ${Math.round((speed - 0.1) * 100)}%`);
  else if (lineScore > 0.85 && speed < userSpeed) setSpeed(Math.min(userSpeed, speed + 0.05), `Nice! Back up to ${Math.round(Math.min(userSpeed, speed + 0.05) * 100)}%`);
}

// ---------- results ----------
function showResults() {
  hidePanels();
  const sum = summarize(song, attempts, { tol, secPerBeat: secPerBeat() });
  if (!sum.total) { showMsg('Nothing to score yet: sing at least one line.', [['Start', () => { $('pMsg').hidden = true; start(part.from); }, 'primary']]); return; }
  // Save progress: run history (for tightening the score) and per-note history (for trouble spots)
  prog.runs.push({ date: Date.now(), score: sum.score, avgAbs: sum.avgAbs, tol, total: sum.total });
  if (prog.runs.length > 50) prog.runs.splice(0, prog.runs.length - 50);
  if (sum.total >= song.notes.length * 0.5) prog.best = Math.max(prog.best ?? 0, sum.score);
  for (const pn of sum.perNote) {
    const h = (prog.noteHist[pn.i] = prog.noteHist[pn.i] || []);
    h.push(Math.round(pn.credit * 100) / 100);
    if (h.length > 6) h.shift();
  }
  if (!repeat && currentLine() >= part.to && displayBeat >= partEnd()) prog.lastLine = part.to === song.lines.length - 1 ? 0 : part.to + 1;
  store.saveSong();

  $('rScore').textContent = sum.score;
  $('rScoreLabel').innerHTML = `${sum.onPitch} of ${sum.total} notes on pitch<br>(on pitch = within ${stepPct(tol)})` +
    (passScores.length > 1 ? `<br>each time: ${passScores.join(', ')}` : '');
  const ul = $('rFindings'); ul.innerHTML = '';
  for (const f of sum.findings) {
    const li = document.createElement('li');
    li.textContent = f.text;
    if (f.good) li.className = 'good';
    ul.append(li);
  }
  const li = document.createElement('li');
  li.className = 'muted'; li.textContent = '100% of a step = one piano key.';
  ul.append(li);
  // Note by note
  const box = $('rNotes'); box.innerHTML = '';
  for (const ls of sum.lineScores) {
    const div = document.createElement('div'); div.className = 'nline';
    div.innerHTML = `<div class="muted">${lineLabel(ls.line)} · ${ls.score} (↑ high, ↓ low, % of a step)</div>`;
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const pn of sum.perNote.filter((x) => x.line === ls.line.index)) {
      const c = document.createElement('span');
      const w = (pn.syl || '~').replace(/-$/, '');
      if (!pn.sung) { c.className = 'chip miss'; c.textContent = `${w} –`; }
      else {
        c.className = 'chip ' + (Math.abs(pn.err) <= tol ? 'ok' : pn.credit > 0.4 ? 'near' : 'off');
        c.textContent = Math.abs(pn.err) <= 10 ? `${w} ✓` : `${w} ${pn.err > 0 ? '↑' : '↓'}${Math.abs(pn.err)}%`;
      }
      chips.append(c);
    }
    div.append(chips); box.append(div);
  }
  // Trouble spot: worst line now, or over recent runs
  const hard = sum.findings.find((f) => f.kind === 'line' && !f.good);
  const tr = hard ? { line: hard.line } : troubleLine(song, prog.noteHist);
  $('rTrouble').hidden = !tr;
  if (tr) {
    $('rTrouble').textContent = `Loop the hardest line`;
    $('rTrouble').onclick = () => { setPart(tr.line, tr.line, true); resetRun(); $('pResults').hidden = true; start(part.from); };
  }
  $('pResults').hidden = false;
}

// ---------- options ----------
function setPart(from, to, rep) {
  part = { from, to }; repeat = rep;
  $('pPart').textContent = from === 0 && to === song.lines.length - 1 ? '' :
    `· ${from === to ? lineLabel(song.lines[from]) : partName(from, to)}${rep ? ' (repeating)' : ''}`;
  renderOptions();
}
function partName(from, to) {
  const l0 = song.lines[from], l1 = song.lines[to];
  if (l0.verse === l1.verse && l0.lineInVerse === 1 && l1.lineInVerse === 4) return `Verse ${l0.verse}`;
  return `${lineLabel(l0)} to ${lineLabel(l1)}`;
}
function partChoices() {
  const out = [['0-' + (song.lines.length - 1), 'Whole song']];
  const verses = [...new Set(song.lines.map((l) => l.verse))];
  for (const v of verses) {
    const ls = song.lines.filter((l) => l.verse === v);
    out.push([`${ls[0].index}-${ls[ls.length - 1].index}`, `Verse ${v}`]);
  }
  for (const l of song.lines) out.push([`${l.index}-${l.index}`, `Line: ${l.text}`]);
  return out;
}
function renderOptions() {
  const s = store.settings();
  const sel = $('oPart');
  if (!sel.options.length) for (const [v, t] of partChoices()) sel.add(new Option(t, v));
  sel.value = `${part.from}-${part.to}`;
  if (sel.selectedIndex < 0) { sel.add(new Option(partName(part.from, part.to), `${part.from}-${part.to}`)); sel.value = `${part.from}-${part.to}`; }
  const tog = (id, on) => $(id).classList.toggle('on', !!on);
  tog('oRepeat', repeat); tog('oGuide', s.guide); tog('oMetro', s.metronome); tog('oNames', s.names); tog('oAuto', s.autoSpeed);
  for (const b of $('oOctave').children) b.classList.toggle('on', Number(b.dataset.v) === song.transpose);
  for (const b of $('oStrict').children) b.classList.toggle('on', b.dataset.v === s.strictness);
  $('oTolNote').textContent = `Score counts a note as on pitch within ${stepPct(tol)} (${STRICTNESS[s.strictness].label}). ` +
    'It tightens on its own as you get more accurate. The pitch line and the breakdown are always exact.';
}
function hidePanels() { $('pOptions').hidden = true; $('pResults').hidden = true; }

function loadSong(octave) {
  song = prepareSong(rawSong, { transpose: octave });
  const s = store.settings();
  tol = tolerance(s.strictness, prog.runs.map((r) => r.avgAbs));
}

function showMsg(text, buttons = []) {
  const m = $('pMsg'); m.innerHTML = '';
  const p = document.createElement('div');
  for (const para of [].concat(text)) { const e = document.createElement('p'); e.textContent = para; p.append(e); }
  m.append(p);
  const row = document.createElement('div'); row.className = 'row';
  for (const [label, fn, cls] of buttons) {
    const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label;
    b.onclick = fn; row.append(b);
  }
  m.append(row); m.hidden = false;
}
function toast(text, ms = 2200) {
  const t = $('pToast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}

export const practiceScreen = {
  init(ctx) {
    go = ctx.go; rawSong = ctx.song;
    $('pBack').addEventListener('click', () => go('home'));
    $('pPlay').addEventListener('click', () => {
      if (state === 'playing' || state === 'starting') pause();
      else if (state === 'paused') resume(currentLine());
      else { resetRun(); start(part.from); }
    });
    $('pSlower').addEventListener('click', () => { setSpeed(speed - 0.05); store.setSetting('speed', speed); });
    $('pFaster').addEventListener('click', () => { setSpeed(speed + 0.05); store.setSetting('speed', speed); });
    $('pOptBtn').addEventListener('click', () => { const open = $('pOptions').hidden; hidePanels(); $('pOptions').hidden = !open; renderOptions(); });
    $('pOptClose').addEventListener('click', () => ($('pOptions').hidden = true));
    $('oPart').addEventListener('change', (e) => { const [a, b] = e.target.value.split('-').map(Number); setPart(a, b, repeat); });
    $('oRepeat').addEventListener('click', () => setPart(part.from, part.to, !repeat));
    const flip = (id, key) => $(id).addEventListener('click', () => { store.setSetting(key, !store.settings()[key]); renderOptions(); });
    flip('oGuide', 'guide'); flip('oMetro', 'metronome'); flip('oNames', 'names'); flip('oAuto', 'autoSpeed');
    $('oOctave').addEventListener('click', (e) => {
      const v = e.target.dataset && e.target.dataset.v; if (v == null) return;
      const wasRunning = state !== 'idle';
      stopSound(); state = 'idle'; if (mic.on) mic.stop();
      store.setSetting('octave', Number(v)); loadSong(Number(v)); resetRun(); renderOptions();
      $('pPlay').textContent = 'Start';
      if (wasRunning) showMsg('Octave changed. Tap Start to sing with the new notes.', [['Start', () => { $('pMsg').hidden = true; hidePanels(); start(part.from); }, 'primary']]);
    });
    $('oStrict').addEventListener('click', (e) => {
      const v = e.target.dataset && e.target.dataset.v; if (!v) return;
      store.setSetting('strictness', v); tol = tolerance(v, prog.runs.map((r) => r.avgAbs)); renderOptions();
    });
    $('rAgain').addEventListener('click', () => { hidePanels(); resetRun(); start(part.from); });
    $('rHome').addEventListener('click', () => go('home'));
    new ResizeObserver(resize).observe($('pCanvas'));
  },
  show(opts = {}) {
    prog = store.song(rawSong.id);
    const s = store.settings();
    const octave = s.octave ?? bestOctave(rawSong, store.get().range);
    loadSong(octave);
    $('pTitle').textContent = song.title;
    speed = 0; setSpeed(s.speed || 1);
    state = 'idle'; resetRun(); hidePanels();
    $('pPlay').textContent = 'Start';
    if (opts.loopLine != null) setPart(opts.loopLine, opts.loopLine, true);
    else setPart(opts.startLine || 0, song.lines.length - 1, false);
    const r = store.get().range;
    showMsg([
      `${opts.startLine ? `Starting from “${song.lines[part.from].text}”. ` : ''}` +
      `The notes are ${song.transpose === -12 ? 'an octave lower than written' : song.transpose === 12 ? 'an octave higher than written' : 'as written'}` +
      `${r && s.octave == null ? ', to suit your range' : ''}. Earbuds in? Tap Start: you’ll get a count-in and your starting note.`,
      store.get().latency == null ? 'Tip: do “Line up timing” on the home screen once with your earbuds, so your voice lines up with the music.' : '',
      'No sound? Check the silent switch on the side of the iPhone.'].filter(Boolean),
      [['Start', () => { $('pMsg').hidden = true; resetRun(); start(part.from); }, 'primary']]);
    visible = true; resize(); requestAnimationFrame(draw);
  },
  hide() {
    visible = false;
    if (state === 'playing' || state === 'starting') { evaluateTick(true); rememberLine(currentLine()); }
    stopSound(); state = 'idle'; if (mic.on) mic.stop();
    clearTimeout(toastTimer); $('pToast').hidden = true;
  },
};
window.__onkeyPractice = { get attempts() { return attempts; }, get frames() { return frames; }, get song() { return song; },
  get state() { return state; }, get anchors() { return anchors; }, get tol() { return tol; }, finish: () => finish() };

// ---------- drawing ----------
function resize() {
  const c = $('pCanvas'), dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  if (!visible) return;
  requestAnimationFrame(draw);
  const c = $('pCanvas'), g = c.getContext('2d'), W = c.clientWidth, H = c.clientHeight;
  if (!W || !H) return;
  g.clearRect(0, 0, W, H);
  const s = store.settings();

  // Where are we in the song (in what you hear/see)?
  let at = null;
  if (state === 'playing' && mic.ctx && anchors.length) at = beatAt(mic.ctx.currentTime - latency);
  if (at) { displayBeat = at.beat; displayAnchor = at.a; }
  const beat = displayBeat ?? (partStart() - countInBeats(song, partStart()));
  const a = displayAnchor;
  const rate = a ? a.rate : rateFor(speed);

  // Vertical scale: the song's notes plus a little room
  const r = store.get().range;
  const lo = song.low - 3, hi = Math.max(song.high + 3, lo + 14);
  const LEFT = 34, nowX = LEFT + (W - LEFT) * NOW_X;
  const pxPerBeat = (W - nowX) / (VIEW_AHEAD * rate);
  const y = (m) => H - 8 - ((m - lo) / (hi - lo)) * (H - 16);
  const x = (b) => nowX + (b - beat) * pxPerBeat;
  const rowH = (H - 16) / (hi - lo);

  // Your comfortable range, faintly
  if (r) {
    const top = y(Math.min(hi, r.high + 0.5)), bot = y(Math.max(lo, r.low - 0.5));
    if (bot > top) { g.fillStyle = 'rgba(124,92,255,.07)'; g.fillRect(LEFT, top, W - LEFT, bot - top); }
  }
  // Grid
  g.font = '11px -apple-system, sans-serif'; g.textBaseline = 'middle';
  for (let m = Math.ceil(lo); m <= hi; m++) {
    const isC = ((m % 12) + 12) % 12 === 0;
    g.strokeStyle = isC ? '#33415f' : isNatural(m) ? '#1e2840' : '#161e31';
    g.lineWidth = 1; g.beginPath(); g.moveTo(LEFT, y(m)); g.lineTo(W, y(m)); g.stroke();
    if (isNatural(m)) { g.fillStyle = isC ? '#c6d0e6' : '#6f7b96'; g.fillText(midiName(m), 3, y(m)); }
  }
  // Bar lines
  g.strokeStyle = '#1b2438';
  for (let b = Math.ceil(beat - 4); b < beat + VIEW_AHEAD * rate + 2; b++) {
    if (!isDownbeat(song, b)) continue;
    const xx = x(b); if (xx < LEFT) continue;
    g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H); g.stroke();
  }
  // Part boundaries (dim everything outside the part you're singing)
  g.fillStyle = 'rgba(11,15,26,.55)';
  const ps = x(partStart()), pe = x(partEnd());
  if (ps > LEFT) g.fillRect(LEFT, 0, ps - LEFT, H);
  if (pe < W) g.fillRect(Math.max(LEFT, pe), 0, W - Math.max(LEFT, pe), H);

  // Target bars
  const target = css('--target');
  for (const n of song.notes) {
    const x0 = x(n.beat), x1 = x(n.end);
    if (x1 < LEFT || x0 > W) continue;
    const inPart = n.beat >= partStart() && n.end <= partEnd() + 1e-6;
    const mark = inPart && n.end <= beat ? noteMark.get(n.i) : null;
    g.fillStyle = mark === 'ok' ? '#2fbf6c' : mark === 'near' ? '#d9903a' : mark === 'off' ? '#d9484d' : mark === 'miss' ? '#2a3550' : target;
    g.globalAlpha = inPart ? 1 : 0.35;
    const h = Math.max(8, rowH * 0.8);
    roundRect(g, Math.max(LEFT, x0) + 1, y(n.midi) - h / 2, Math.max(2, x1 - Math.max(LEFT, x0) - 2), h, 4);
    g.fill();
    if (s.names && x1 - x0 > 24 && x0 > LEFT - 10) {
      g.fillStyle = '#04101e'; g.font = 'bold 11px -apple-system, sans-serif';
      g.fillText(midiName(n.midi), Math.max(LEFT, x0) + 5, y(n.midi) + 0.5);
    }
    g.globalAlpha = 1;
  }

  // Now line
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(nowX, 0); g.lineTo(nowX, H); g.stroke();

  // Your voice (only the current time through, so a repeat starts clean)
  const voice = css('--voice');
  const pts = a ? (frames.get(a.pass) || []) : [];
  g.save(); g.beginPath(); g.rect(LEFT, 0, W - LEFT, H); g.clip();
  g.strokeStyle = voice; g.lineWidth = 3.5; g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  let last = null, offLow = false, offHigh = false;
  for (let k = Math.max(0, pts.length - 600); k < pts.length; k++) {
    const p = pts[k];
    if (p.midi == null) { last = null; continue; }
    const xx = x(p.beat); if (xx < LEFT - 5) { last = null; continue; }
    if (!last || p.beat - last.beat > 0.4 * rate || Math.abs(p.midi - last.midi) > 4) g.moveTo(xx, y(p.midi)); else g.lineTo(xx, y(p.midi));
    last = p;
  }
  g.stroke();
  const head = pts.length ? pts[pts.length - 1] : null;
  if (head && head.midi != null && state === 'playing' && beat - head.beat < 0.3) {
    if (head.midi < lo) offLow = true; else if (head.midi > hi) offHigh = true;
    else {
      g.fillStyle = voice; g.beginPath(); g.arc(x(head.beat), y(head.midi), 6, 0, Math.PI * 2); g.fill();
      // Exact live readout next to your voice, against the note you should be on right now
      const n = song.notes.find((q) => q.beat <= head.beat && head.beat < q.end && q.beat >= (a ? a.songFrom : 0));
      if (n && (head.beat - n.beat) / rate > 0.15) { // once you've settled on the note
        let cents = Math.round((head.midi - n.midi) * 100);
        const oct = Math.round(cents / 1200); cents -= oct * 1200;
        const txt = offWords(cents) + (oct ? (oct < 0 ? ' (octave low)' : ' (octave high)') : '');
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = Math.abs(cents) <= tol ? '#36d67a' : '#ffa94d';
        g.fillText(txt, x(head.beat) + 10, y(head.midi) - 12);
      }
    }
  }
  g.restore();
  if (offLow || offHigh) {
    g.fillStyle = voice; g.font = 'bold 13px -apple-system, sans-serif';
    g.fillText(offLow ? '▼ you’re below the screen (an octave low?)' : '▲ you’re above the screen', nowX + 8, offLow ? H - 12 : 12);
  }

  // Count-in
  const cnt = $('pCount');
  if (state === 'playing' && a && beat < a.songFrom) {
    const left = Math.ceil(a.songFrom - beat);
    const first = song.notes.find((n) => n.beat >= a.songFrom);
    cnt.innerHTML = `${left}<small>starts on ${first ? midiName(first.midi) : ''}</small>`;
    cnt.hidden = false;
  } else cnt.hidden = true;

  drawLyrics(beat, a);
}

let lyricLine = -1;
function drawLyrics(beat, a) {
  // The line being sung (or about to be), and the next one
  let li = part.from;
  for (let k = part.from; k <= part.to; k++) if (song.lines[k].start <= beat + 0.5) li = k;
  if (a && beat < a.songFrom) { const k = song.lines.findIndex((l) => l.start === a.songFrom); if (k >= 0) li = k; }
  const now = $('pLyric');
  if (li !== lyricLine) {
    lyricLine = li; now.innerHTML = '';
    const l = song.lines[li];
    for (let i = l.firstNote; i <= l.lastNote; i++) {
      const n = song.notes[i]; if (!n.syl) continue;
      const sp = document.createElement('span');
      sp.textContent = n.syl.endsWith('-') ? n.syl.slice(0, -1) : n.syl + ' ';
      sp.dataset.i = i; now.append(sp);
    }
    const nx = li + 1 <= part.to ? song.lines[li + 1] : repeat ? song.lines[part.from] : null;
    $('pLyricNext').textContent = nx ? nx.text : '';
  }
  for (const sp of now.children) {
    const n = song.notes[Number(sp.dataset.i)];
    // the syllable stays lit through any slurred notes after it
    let end = n.end; for (let j = n.i + 1; j < song.notes.length && !song.notes[j].syl; j++) end = song.notes[j].end;
    sp.className = beat >= end ? 'sung' : beat >= n.beat - 0.05 ? 'cur' : '';
  }
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
