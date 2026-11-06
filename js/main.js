import { Mic, unlockAudio } from './audio/mic.js';
import { midiName, centsOff, isNatural } from './music/notes.js';

const $ = (id) => document.getElementById(id);
const micBtn = $('micBtn'), toneBtn = $('toneBtn'), badge = $('micBadge');
const noteEl = $('noteName'), centsEl = $('cents'), hzEl = $('hz'), levelEl = $('level');
const hint = $('hint'), deviceEl = $('device');
const canvas = $('graph'), g = canvas.getContext('2d');

const WINDOW_MS = 6000;      // how much history is visible
const SPAN = 24;             // semitones visible top-to-bottom
const history = [];          // { t, midi|null }
let center = 52;             // graph centre (E3) until we hear a voice
window.__onkey = { history }; // for automated tests only (stays in memory)

const mic = new Mic({
  onFrame(r) {
    history.push({ t: r.t, midi: r.midi });
    while (history.length && r.t - history[0].t > WINDOW_MS + 500) history.shift();
    levelEl.style.width = Math.min(100, (r.level / 0.1) * 100) + '%';
    if (r.midi !== null) {
      // Average the last ~0.25 s so vibrato doesn't make the readout flicker
      const recent = history.slice(-8).filter((p) => p.midi !== null).map((p) => p.midi);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const c = centsOff(avg);
      noteEl.textContent = midiName(avg);
      centsEl.textContent = c === 0 ? 'on' : (c > 0 ? `+${c}¢ sharp` : `${c}¢ flat`);
      centsEl.className = 'cents ' + (Math.abs(c) <= 10 ? 'ok' : c > 0 ? 'sharp' : 'flat');
      hzEl.textContent = r.freq.toFixed(1) + ' Hz';
      center += (r.midi - center) * 0.04; // gently follow the voice
    }
  },
  onStateChange(on, reason) {
    badge.hidden = !on;
    micBtn.textContent = on ? 'Stop mic' : 'Start mic';
    micBtn.classList.toggle('stop', on);
    hint.hidden = on;
    if (on) {
      deviceEl.textContent = `Listening on: ${mic.deviceLabel || 'microphone'} · ${mic.sampleRate} Hz · on-device only`;
    } else {
      deviceEl.textContent = reason === 'background'
        ? 'Mic turned off because OnKey went to the background.'
        : 'Microphone off. Nothing is recorded or sent anywhere.';
      noteEl.textContent = '–'; centsEl.innerHTML = '&nbsp;'; hzEl.innerHTML = '&nbsp;';
      levelEl.style.width = '0';
    }
  },
});

micBtn.addEventListener('click', async () => {
  if (mic.on) { mic.stop(); return; }
  try {
    await mic.start();
  } catch (e) {
    hint.hidden = false;
    hint.textContent = e.name === 'NotAllowedError'
      ? 'Microphone permission was denied. In Settings › Safari › Microphone, allow access, then try again.'
      : 'Could not start the microphone: ' + e.message;
  }
});

toneBtn.addEventListener('click', () => {
  const ac = unlockAudio(); // synchronous, inside the tap
  const t0 = ac.currentTime;
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 220; // A3
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.3, t0 + 0.05);
  gain.gain.setValueAtTime(0.3, t0 + 1.3);
  gain.gain.linearRampToValueAtTime(0, t0 + 1.6);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0); osc.stop(t0 + 1.7);
});

// ---------- drawing ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(canvas);
resize();

function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  g.clearRect(0, 0, W, H);
  const nowX = W - 40;
  const lo = center - SPAN / 2;
  const y = (m) => H - ((m - lo) / SPAN) * H;
  const x = (t, now) => nowX - ((now - t) / WINDOW_MS) * (nowX - 34);

  // Semitone grid
  g.font = '11px -apple-system, sans-serif';
  g.textBaseline = 'middle';
  for (let m = Math.floor(lo); m <= Math.ceil(lo + SPAN); m++) {
    const yy = y(m);
    const isC = ((m % 12) + 12) % 12 === 0;
    g.strokeStyle = isC ? '#3a4a6e' : isNatural(m) ? '#212b42' : '#182033';
    g.lineWidth = isC ? 1.5 : 1;
    g.beginPath(); g.moveTo(32, yy); g.lineTo(W, yy); g.stroke();
    if (isNatural(m) && yy > 8 && yy < H - 8) {
      g.fillStyle = isC ? '#c6d0e6' : '#6f7b96';
      g.fillText(midiName(m), 4, yy);
    }
  }
  // "Now" line
  g.strokeStyle = 'rgba(255,255,255,.35)';
  g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(nowX, 0); g.lineTo(nowX, H); g.stroke();
  g.setLineDash([]);

  // Voice line
  const now = performance.now();
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--voice');
  g.lineWidth = 3.5; g.lineJoin = 'round'; g.lineCap = 'round';
  g.save();
  g.beginPath(); g.rect(34, 0, W, H); g.clip();
  g.beginPath();
  let pen = false, last = null;
  for (const p of history) {
    if (p.midi === null) { pen = false; continue; }
    const px = x(p.t, now), py = y(p.midi);
    if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
    last = p;
  }
  g.stroke();
  if (last && now - last.t < 120) {
    g.fillStyle = g.strokeStyle;
    g.beginPath(); g.arc(x(last.t, now), y(last.midi), 6, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
