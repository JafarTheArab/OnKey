import { Mic } from './audio/mic.js';
import { encodeWav } from './audio/wav.js';
import { unlockAudio, audioState, setSessionType, output, routeName, sessionType } from './audio/engine.js';
import { midiName, centsOff, isNatural } from './music/notes.js';

const $ = (id) => document.getElementById(id);
const micBtn = $('micBtn'), toneBtn = $('toneBtn'), badge = $('micBadge');
const noteEl = $('noteName'), centsEl = $('cents'), hzEl = $('hz'), levelEl = $('level');
const hint = $('hint'), deviceEl = $('device'), reportEl = $('report'), soundEl = $('soundState');
const rawEl = $('raw'), sampleBtn = $('sampleBtn'), shareBtn = $('shareBtn');
const canvas = $('graph'), g = canvas.getContext('2d');

const WINDOW_MS = 6000;      // how much history is visible
const SPAN = 24;             // semitones visible top-to-bottom
const history = [];          // { t, midi|null }
let center = 52;             // graph centre (E3) until we hear a voice
window.__onkey = { history }; // for automated tests only (stays in memory)

// Cut-out report: counts gaps that happen in the middle of singing, and why
let stats = null;
let lastVoicedT = 0, gapReasons = [];
function resetStats() { stats = { voiced: 0, gaps: 0, quiet: 0, unclear: 0 }; gapReasons = []; lastVoicedT = 0; }

const mic = new Mic({
  onWarn(kind) {
    if (kind === 'nodata') {
      hint.textContent = 'The mic is on, but no sound is reaching OnKey. Tap Stop mic, then Start mic again.';
      hint.hidden = false;
    }
  },
  onFrame(r) {
    history.push({ t: r.t, midi: r.midi });
    if (stats) {
      if (r.midi !== null) {
        // A very short silence (under 0.25 s) between two sung moments counts as a cut-out
        if (gapReasons.length && r.t - lastVoicedT < 250) {
          stats.gaps++;
          stats.quiet += gapReasons.filter((x) => x === 'quiet').length;
          stats.unclear += gapReasons.filter((x) => x === 'unclear').length;
        }
        gapReasons = []; lastVoicedT = r.t; stats.voiced++;
      } else if (lastVoicedT) gapReasons.push(r.reason);
    }
    while (history.length && r.t - history[0].t > WINDOW_MS + 500) history.shift();
    levelEl.style.width = Math.min(100, (r.level / 0.1) * 100) + '%';
    // Diagnosis readout: what the detector found, even if it rejected it (refreshed ~6x a second)
    if (r.t - (rawEl._t || 0) > 160) {
      rawEl._t = r.t;
      rawEl.textContent = r.raw
        ? `heard ${Math.round(r.raw.freq)} Hz · ${Math.round(r.raw.clarity * 100)}% clear${r.midi === null ? ' (skipped)' : ''}`
        : r.reason === 'quiet' ? 'too quiet to read' : r.reason === 'unclear' ? 'no note found' : '';
    }
    if (r.midi !== null) {
      // Average the last ~0.25 s so vibrato doesn't make the readout flicker
      const recent = history.slice(-8).filter((p) => p.midi !== null).map((p) => p.midi);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const c = centsOff(avg);
      noteEl.textContent = midiName(avg);
      centsEl.textContent = c === 0 ? 'right on' : (c > 0 ? `${c} cent${c === 1 ? '' : 's'} sharp` : `${-c} cent${c === -1 ? '' : 's'} flat`);
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
    reportEl.hidden = true;
    sampleBtn.hidden = !on;
    if (on) {
      resetStats();
      deviceEl.textContent = `Listening on: ${mic.deviceLabel || 'microphone'} · ${mic.sampleRate} Hz · on-device only`;
    } else {
      deviceEl.textContent = {
        background: 'Mic turned off because OnKey went to the background.',
        error: 'Mic turned off because something went wrong (see the message above).',
        ended: 'Mic turned off by the iPhone (another app or a call may have taken it).',
      }[reason] || 'Microphone off. Nothing is recorded or sent anywhere.';
      noteEl.textContent = '–'; centsEl.innerHTML = '&nbsp;'; hzEl.innerHTML = '&nbsp;';
      levelEl.style.width = '0';
      rawEl.innerHTML = '&nbsp;';
      if (stats && stats.voiced > 15) {
        const why = stats.gaps === 0 ? ' Nice and steady.' : stats.quiet >= stats.unclear
          ? ' Mostly <b>too quiet</b>: the mic barely heard you.'
          : ' Mostly <b>unclear sound</b>: the mic heard you but couldn’t lock onto the note.';
        reportEl.innerHTML = `Line cut out <b>${stats.gaps}</b> time${stats.gaps === 1 ? '' : 's'} while you sang.${why}`;
        reportEl.hidden = false;
        hint.hidden = true;
      }
      stats = null;
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
      : /stuck/.test(e.message)
        ? 'The iPhone’s sound didn’t start, so I turned the mic back off. Tap Start mic again.'
        : 'Could not start the microphone: ' + e.message;
  }
});

// Diagnostic sample: only captured when tapped; stays in memory on this phone unless you share it
let sampleFile = null;
sampleBtn.addEventListener('click', async () => {
  if (!mic.on) return;
  sampleBtn.disabled = true;
  let left = 5;
  sampleBtn.textContent = `Sing now… ${left}`;
  const tick = setInterval(() => { left--; if (left > 0) sampleBtn.textContent = `Sing now… ${left}`; }, 1000);
  const { samples, sampleRate } = await mic.captureSample(5);
  clearInterval(tick);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  sampleFile = new File([encodeWav(samples, sampleRate)], `onkey-sample-${stamp}.wav`, { type: 'audio/wav' });
  sampleBtn.textContent = 'Save 5-sec sample';
  sampleBtn.disabled = false;
  shareBtn.hidden = false;
});
shareBtn.addEventListener('click', async () => {
  if (!sampleFile) return;
  try {
    if (navigator.canShare && navigator.canShare({ files: [sampleFile] })) {
      await navigator.share({ files: [sampleFile], title: 'OnKey sample' });
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); // fallback: download
  a.href = URL.createObjectURL(sampleFile); a.download = sampleFile.name; a.click();
});

function showSound(extra = '') {
  soundEl.textContent = 'Sound: ' + audioState() + ' · ' + routeName() + (sessionType() ? ' · ' + sessionType() : '') + extra;
}
window.addEventListener('onkey-audiostate', () => showSound());

toneBtn.addEventListener('click', () => {
  if (!mic.on) setSessionType('playback');
  const ac = unlockAudio(); // synchronous, inside the tap (rebuilds the engine if the mode changed)
  const play = () => {
    const t0 = ac.currentTime + 0.05;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sawtooth'; // brighter than a soft sine, easier to hear on a phone speaker
    osc.frequency.value = 220; // A3
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.05);
    gain.gain.setValueAtTime(0.25, t0 + 1.3);
    gain.gain.linearRampToValueAtTime(0, t0 + 1.6);
    osc.connect(gain).connect(output());
    osc.start(t0); osc.stop(t0 + 1.7);
  };
  if (ac.state === 'running') play();
  else ac.resume().then(play).catch(() => {});
  showSound(' · playing A3');
  setTimeout(() => showSound(), 1800);
});

// Backup: plays the same note through a plain <audio> element instead of the sound engine
let backupUrl = null;
function makeToneWav(freq, secs, sr = 44100) {
  const n = Math.floor(secs * sr), b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = Math.min(1, t / 0.05, (secs - t) / 0.1);
    let x = 0; [1, .5, .33, .25, .2].forEach((a, k) => (x += a * Math.sin(2 * Math.PI * freq * (k + 1) * t)));
    v.setInt16(44 + i * 2, Math.round(x * 0.35 * env * 32767), true);
  }
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
$('tone2Btn').addEventListener('click', () => {
  backupUrl = backupUrl || makeToneWav(220, 1.6);
  const a = new Audio(backupUrl);
  a.setAttribute('playsinline', '');
  a.play().then(() => showSound(' · backup playing')).catch((e) => showSound(' · backup failed: ' + e.name));
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
    if (p.midi === null) continue;
    const px = x(p.t, now), py = y(p.midi);
    // Join across tiny gaps (under 0.2 s) so the line doesn't flicker; break on real silences
    if (!pen || !last || p.t - last.t > 200) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
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
