// Timing check: plays clicks, you say "ta" on each one; OnKey measures the delay between
// a sound being played and hearing your answer (earbuds, especially Bluetooth, add a delay).
import { Mic, preferPhoneMic } from '../audio/mic.js';
import { makeBus, click } from '../practice/sounds.js';
import { store } from '../store.js';

const $ = (id) => document.getElementById(id);
const N = 10, GAP = 0.6, USE_FROM = 2;
let go, clicks = [], onsets = [], armed = 0, timer = null, measured = null, bus = null;

/** Pure: match each click to the first "ta" just after it. Returns { delay, spread, n } or null. */
export function measureDelay(clickTimes, onsetTimes) {
  const offs = [];
  for (const c of clickTimes) {
    const o = onsetTimes.find((t) => t >= c - 0.12 && t <= c + 0.6);
    if (o != null) offs.push(o - c);
  }
  if (offs.length < 5) return null;
  const s = [...offs].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
  const dev = offs.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  return { delay: Math.max(0, med), spread: dev[Math.floor(dev.length / 2)], n: offs.length };
}

const mic = new Mic({
  onFrame(r) {
    const thresh = Math.max((r.gate || 0) * 3, 0.0012);
    if (r.level < thresh * 0.5) armed++;
    else if (r.level > thresh && armed >= 2) {
      armed = 0; onsets.push(r.ct);
      const d = $('tmBeat'); d.classList.add('flash'); setTimeout(() => d.classList.remove('flash'), 120);
    }
  },
  onStateChange(on, reason) {
    $('tmMicBadge').hidden = !on;
    if (!on && timer) { clearTimeout(timer); timer = null; if (reason !== 'user') $('tmResult').textContent = 'Stopped early. Tap Start to try again.'; $('tmGo').disabled = false; }
  },
});

function showValue() {
  const l = store.get().latency;
  $('tmValue').textContent = l != null ? `${Math.round(l * 1000)} ms` : 'not set';
}

async function start() {
  $('tmGo').disabled = true; $('tmSave').hidden = true; measured = null;
  $('tmResult').textContent = 'Get ready…';
  try { await mic.start({ preferPhoneMic: preferPhoneMic() }); }
  catch (e) { $('tmResult').textContent = 'Could not start the microphone. Tap Start to try again.'; $('tmGo').disabled = false; return; }
  const ac = mic.ctx;
  bus = makeBus(ac);
  onsets = []; armed = 0;
  // First click 1.5 s after the mic opened (predictable, and gives you a moment to get ready)
  const t0 = ac.currentTime + Math.max(0.5, (mic.openedAt + 1500 - performance.now()) / 1000);
  clicks = Array.from({ length: N }, (_, k) => t0 + k * GAP);
  clicks.forEach((t, k) => click(ac, bus, t, k % 4 === 0, 1.4));
  $('tmResult').textContent = 'Say “ta” on every click…';
  timer = setTimeout(done, (t0 - ac.currentTime + N * GAP + 0.8) * 1000);
}

function done() {
  timer = null;
  const res = measureDelay(clicks.slice(USE_FROM), onsets);
  mic.stop();
  $('tmGo').disabled = false; $('tmGo').textContent = 'Try again';
  if (!res || res.spread > 0.07) {
    $('tmResult').textContent = res ? 'Your “ta”s were a bit uneven, so the reading isn’t reliable. Try again, right on the clicks.'
      : 'OnKey didn’t hear enough “ta”s. Say them a little louder, right on each click.';
    return;
  }
  measured = res.delay;
  const ms = Math.round(res.delay * 1000);
  $('tmResult').textContent = `Delay: ${ms} ms. ` + (ms > 150 ? 'That’s typical for Bluetooth earbuds.' : 'Nice and small.');
  $('tmSave').hidden = false;
}

export const timingScreen = {
  init(ctx) {
    go = ctx.go;
    $('tmGo').addEventListener('click', start);
    $('tmSave').addEventListener('click', () => { store.set({ latency: measured }); showValue(); go('home'); });
    $('tmBack').addEventListener('click', () => go('home'));
    const nudge = (d) => { const l = store.get().latency ?? 0.12; store.set({ latency: Math.max(0, Math.round((l + d) * 1000) / 1000) }); showValue(); };
    $('tmMinus').addEventListener('click', () => nudge(-0.01));
    $('tmPlus').addEventListener('click', () => nudge(0.01));
  },
  show() { $('tmResult').textContent = ''; $('tmSave').hidden = true; $('tmGo').textContent = 'Start'; $('tmGo').disabled = false; showValue(); },
  hide() { if (timer) { clearTimeout(timer); timer = null; } mic.stop(); },
};
