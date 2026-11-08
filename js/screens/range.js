// Range test: lowest comfortable note, highest comfortable note, then a slide between them.
import { Mic, preferPhoneMic } from '../audio/mic.js';
import { midiName, isNatural } from '../music/notes.js';
import { steadyHolds, slideExtent, describeRange } from '../music/range.js';
import { store } from '../store.js';

const $ = (id) => document.getElementById(id);
const STEPS = [
  { title: 'Your range', text: 'Three short steps, about a minute. Sing on “ah” or hum, at a normal, relaxed volume. Your voice is analysed on this phone only; nothing is recorded.', go: 'Start' },
  { title: '1. Your lowest comfortable note', text: 'Sing a low note you could use in a song (not a growl), and hold it for about 2 seconds. You can try a few; OnKey keeps the lowest steady one.', go: 'Next' },
  { title: '2. Your highest comfortable note', text: 'Now a high note you can sing without straining or flipping into a thin, breathy voice. Hold it for about 2 seconds.', go: 'Next' },
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
    $('rgMicBadge').hidden = !on;
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
    const holds = steadyHolds(stepFrames, 900);
    if (!holds.length) return;
    const pick = step === 1 ? Math.min(...holds.map((h) => h.midi)) : Math.max(...holds.map((h) => h.midi));
    found[step === 1 ? 'low' : 'high'] = pick;
    $('rgHeard').textContent = `Heard ${midiName(pick)} ✓  ${step === 1 ? 'Go lower if it’s still comfortable, or tap Next.' : 'Go higher if it’s still comfortable, or tap Next.'}`;
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
  let { low, high, slide } = found;
  if (high - low < 3) {
    step = 2; render();
    $('rgHeard').textContent = 'Your high and low notes came out very close. Let’s redo step 2 with a higher note.';
    $('rgGo').textContent = 'Start step 2';
    $('rgGo').disabled = false;
    $('rgGo').dataset.restart = '1';
    return;
  }
  const r = { low: Math.round(low), high: Math.round(high), date: Date.now() };
  r.reachLow = Math.round(Math.min(low, slide ? slide.low : low));
  r.reachHigh = Math.round(Math.max(high, slide ? slide.high : high));
  store.set({ range: r });
  center = (r.low + r.high) / 2;
  step = 4; render();
  $('rgText').innerHTML = `Your comfortable range is <b>${describeRange(r)}</b>.<br>On the slide you reached ${midiName(r.reachLow)} to ${midiName(r.reachHigh)}.` +
    '<br><span class="muted small">OnKey uses this to pick the octave for songs. Ranges change with warm-up and time of day; redo it any time from the home screen.</span>';
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
  if (lastV) center += (lastV.midi - center) * 0.03;
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
