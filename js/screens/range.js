// Range test: lowest easy note, highest easy note, then a slide.
// Two results: your REACH (everything you hit, even briefly) and your COMFORTABLE range (notes you
// held steadily for ~2 s), which you can fine-tune with − / + afterwards. Songs use the comfortable one.
import { Mic, preferPhoneMic, showMicBadge } from '../audio/mic.js';
import { midiName, isNatural } from '../music/notes.js';
import { steadyHolds, slideExtent, describeRange, describeReach, isSteadyHold, voiceType } from '../music/range.js';
import { store } from '../store.js';

const $ = (id) => document.getElementById(id);
const STEPS = [
  { title: 'Your range', text: 'Three short steps, about a minute. Sing on “ah” or hum, at a normal, relaxed volume. Your voice is analysed on this phone only; nothing is recorded.', go: 'Start' },
  { title: '1. A low, easy note', text: 'Sing a low note you could use in a song and hold it steady for about 3 seconds, without pushing. You can try a few: OnKey keeps the lowest one you hold steadily.', go: 'Next' },
  { title: '2. A high, easy note', text: 'Now a high note you can hold steady for about 3 seconds and that still sounds clean, not strained or shrill. Go as high as you like, but only steady notes count as comfortable.', go: 'Next' },
  { title: '3. A slide', text: 'Slide smoothly from low to high and back down, like a siren, on “oo”. Do it once or twice.', go: 'Finish' },
  { title: 'Your range', text: '', go: 'Done' },
];

let go, step = 0, frames = [], found = {}, visible = false, firstRun = false;
const canvas = () => $('rgCanvas');

const mic = new Mic({
  onFrame(r) {
    frames.push({ t: r.t, midi: r.midi });
    if (frames.length > 2000) frames.shift();
    analyse();
  },
  onStateChange(on, reason) {
    showMicBadge($('rgMicBadge'), mic, on);
    if (!on && step >= 1 && step <= 3 && reason !== 'user') {
      $('rgHeard').textContent = reason === 'background' ? 'Paused because OnKey went to the background. Tap Start this step again.' : 'The mic stopped. Tap Start this step again.';
      $('rgGo').disabled = true; $('rgRedo').hidden = false;
    }
  },
});

let stepFrames = [];
function analyse() {
  stepFrames.push(frames[frames.length - 1]);
  if (step === 1 || step === 2) {
    const holds = steadyHolds(stepFrames, 600);
    if (!holds.length) return;
    const lowStep = step === 1, k = lowStep ? 'low' : 'high';
    const pickOf = (hs) => (hs.length ? (lowStep ? Math.min : Math.max)(...hs.map((h) => h.midi)) : null);
    const steady = pickOf(holds.filter(isSteadyHold));
    const any = pickOf(holds);
    found[k] = steady;
    found[k + 'Reach'] = any;
    if (steady != null) {
      const extra = any != null && (lowStep ? any < steady - 0.5 : any > steady + 0.5)
        ? ` You also touched ${midiName(any)}, but it wasn’t steady, so that counts as your reach.` : '';
      $('rgHeard').textContent = `Held ${midiName(steady)} steadily ✓${extra} ${lowStep ? 'Lower if it’s still easy,' : 'Higher if it’s still clean,'} or tap Next.`;
    } else {
      const h = holds[holds.length - 1];
      $('rgHeard').textContent = `Heard ${midiName(any)}, ${h.dur < 1800 ? 'but only briefly. Hold it for about 3 seconds.' : 'but it wavered. Try a slightly easier note.'}`;
    }
    $('rgGo').disabled = false;
  } else if (step === 3) {
    const ext = slideExtent(stepFrames);
    if (ext && ext.high - ext.low >= 5) {
      found.slide = ext;
      $('rgHeard').textContent = `Slide heard: ${midiName(ext.low)} up to ${midiName(ext.high)} ✓`;
      $('rgGo').disabled = false;
    }
  }
}

function render() {
  const s = STEPS[step];
  $('rgTitle').textContent = step === 0 && firstRun ? 'Welcome to OnKey' : s.title;
  $('rgText').textContent = step === 0 && firstRun ? 'First, let’s find your comfortable range, so songs and exercises suit your voice. ' + s.text : s.text;
  $('rgGo').textContent = s.go;
  $('rgGo').disabled = step >= 1 && step <= 3;
  $('rgRedo').hidden = !(step >= 1 && step <= 3);
  $('rgStep').textContent = step >= 1 && step <= 3 ? `Step ${step} of 3` : '';
  $('rgHeard').textContent = '';
}

async function startMic() {
  try { await mic.start({ preferPhoneMic: preferPhoneMic() }); }
  catch (e) {
    $('rgHeard').textContent = e.name === 'NotAllowedError'
      ? 'Microphone permission was denied. In Settings › Safari › Microphone, allow access, then try again.'
      : 'Could not start the microphone. Tap Start this step again.';
    $('rgRedo').hidden = false;
  }
}

function finish() {
  mic.stop();
  const { slide } = found;
  // No steady note in a step: fall back to what was heard, nudged inward (you can adjust it next)
  const low = found.low ?? (found.lowReach != null ? found.lowReach + 2 : null);
  const high = found.high ?? (found.highReach != null ? found.highReach - 2 : null);
  if (low == null || high == null || high - low < 3) {
    step = 2; render();
    $('rgHeard').textContent = 'Your high and low notes came out very close. Let’s redo step 2 with a higher note.';
    $('rgGo').textContent = 'Start step 2';
    $('rgGo').disabled = false;
    $('rgGo').dataset.restart = '1';
    return;
  }
  const all = [low, high, found.lowReach, found.highReach, slide && slide.low, slide && slide.high].filter((x) => x != null);
  const r = { low: Math.round(low), high: Math.round(high), date: Date.now(),
    reachLow: Math.round(Math.min(...all)), reachHigh: Math.round(Math.max(...all)) };
  store.set({ range: r });
  center = (r.low + r.high) / 2;
  showResult();
}

/** The result, with − / + to fine-tune the comfortable range. Also opened from the home screen ("Adjust"). */
function showResult() {
  step = 4; render();
  const r = store.get().range;
  const box = $('rgText'); box.innerHTML = '';
  const line = (html) => { const d = document.createElement('div'); d.innerHTML = html; box.append(d); return d; };
  if (r.reachLow != null) line(`You can <b>reach</b> ${describeReach(r)}.`);
  line('<b>Comfortable for songs:</b>');
  const rowLo = line('<span class="adj-label">Lowest</span>'), rowHi = line('<span class="adj-label">Highest</span>');
  rowLo.className = rowHi.className = 'adjust';
  const mk = (txt, fn) => { const b = document.createElement('button'); b.className = 'btn small inline'; b.textContent = txt; b.onclick = fn; return b; };
  const lowEl = document.createElement('b'), highEl = document.createElement('b');
  const nudge = (k, d) => {
    const v = r[k] + d;
    if (k === 'low' && (v >= r.high - 2 || v < 24)) return;
    if (k === 'high' && (v <= r.low + 2 || v > 96)) return;
    r[k] = v;
    // reach always includes the comfortable range
    r.reachLow = Math.min(r.reachLow ?? v, r.low); r.reachHigh = Math.max(r.reachHigh ?? v, r.high);
    store.set({ range: r });
    upd();
  };
  rowLo.append(mk('−', () => nudge('low', -1)), lowEl, mk('+', () => nudge('low', 1)));
  rowHi.append(mk('−', () => nudge('high', -1)), highEl, mk('+', () => nudge('high', 1)));
  const type = line('');
  line('<span class="muted small">Top note felt forced or shrill? Tap − until it’s one you could hold in a song. You can adjust this any time from the home screen.</span>');
  function upd() {
    lowEl.textContent = midiName(r.low); highEl.textContent = midiName(r.high);
    found.low = r.low; found.high = r.high; // the marks on the graph follow your adjustments
    const t = voiceType(r.low, r.high);
    type.textContent = `That’s ${/^[aeiou]/.test(t) ? 'an' : 'a'} ${t} range.`;
    if (r.reachLow != null) box.firstChild.innerHTML = `You can <b>reach</b> ${describeReach(r)}.`;
  }
  upd();
}

function onGo() {
  if ($('rgGo').dataset.restart) { delete $('rgGo').dataset.restart; stepFrames = []; startMic(); render(); return; }
  if (step === 0) { step = 1; found = {}; stepFrames = []; render(); startMic(); return; }
  if (step === 1 || step === 2) { step++; stepFrames = []; render(); if (!mic.on) startMic(); return; }
  if (step === 3) { finish(); return; }
  go('home');
}

export const rangeScreen = {
  init(ctx) {
    go = ctx.go;
    $('rgGo').addEventListener('click', onGo);
    $('rgRedo').addEventListener('click', () => {
      stepFrames = []; delete found[step === 1 ? 'low' : step === 2 ? 'high' : 'slide'];
      render();
      if (!mic.on) startMic();
    });
    $('rgBack').addEventListener('click', () => {
      if (!store.get().range) store.set({ rangeSkipped: true });
      go('home');
    });
    new ResizeObserver(resize).observe(canvas());
  },
  show(opts = {}) {
    firstRun = !!opts.firstRun; step = 0; found = {}; frames = []; stepFrames = [];
    visible = true; render(); resize(); requestAnimationFrame(draw);
    if (opts.adjust && store.get().range) { const r = store.get().range; center = (r.low + r.high) / 2; showResult(); }
  },
  hide() { visible = false; mic.stop(); },
};

function resize() {
  const c = canvas(), dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

let center = 52;
function draw() {
  if (!visible) return;
  const c = canvas(), g = c.getContext('2d'), W = c.clientWidth, H = c.clientHeight;
  g.clearRect(0, 0, W, H);
  const SPAN = 30, WIN = 6000, now = performance.now();
  const lastV = [...frames].reverse().find((f) => f.midi != null && now - f.t < 1000);
  if (lastV && step < 4) center += (lastV.midi - center) * 0.03;
  const lo = center - SPAN / 2, y = (m) => H - ((m - lo) / SPAN) * H, x = (t) => W - 20 - ((now - t) / WIN) * (W - 54);
  g.font = '11px -apple-system, sans-serif'; g.textBaseline = 'middle';
  for (let m = Math.floor(lo); m <= Math.ceil(lo + SPAN); m++) {
    if (!isNatural(m)) continue;
    const isC = ((m % 12) + 12) % 12 === 0;
    g.strokeStyle = isC ? '#3a4a6e' : '#1d2740'; g.beginPath(); g.moveTo(32, y(m)); g.lineTo(W, y(m)); g.stroke();
    g.fillStyle = isC ? '#c6d0e6' : '#6f7b96'; g.fillText(midiName(m), 4, y(m));
  }
  for (const k of ['low', 'high']) {
    if (found[k] == null) continue;
    g.fillStyle = 'rgba(63,167,255,.85)'; g.fillRect(34, y(found[k]) - 3, W - 34, 6);
    g.fillText(`${k === 'low' ? 'lowest' : 'highest'}: ${midiName(found[k])}`, W - 120, y(found[k]) - 12);
  }
  g.strokeStyle = '#ffd23f'; g.lineWidth = 3.5; g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  let last = null;
  for (const f of frames) {
    if (f.midi == null || now - f.t > WIN) continue;
    if (!last || f.t - last.t > 200 || Math.abs(f.midi - last.midi) > 4) g.moveTo(x(f.t), y(f.midi)); else g.lineTo(x(f.t), y(f.midi));
    last = f;
  }
  g.stroke();
  requestAnimationFrame(draw);
}
