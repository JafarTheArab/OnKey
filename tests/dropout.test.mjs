// Rough, breathy, wavering voice held on one note: how much of it is detected?
import { PitchTracker } from '../js/audio/pitch.js';
const sr = 48000, dur = 3, n = sr * dur, buf = new Float32Array(n);
let ph = 0;
for (let i = 0; i < n; i++) {
  const t = i / sr;
  const f = 196 * 2 ** ((0.4 * Math.sin(2 * Math.PI * 5.5 * t) + 0.15 * Math.sin(2 * Math.PI * 0.7 * t)) / 12);
  ph += 2 * Math.PI * f / sr * (1 + (Math.random() - .5) * 0.02); // jitter
  let v = 0; [1, .8, .6, .5, .4, .3, .2].forEach((a, k) => v += a * Math.sin((k + 1) * ph));
  const shimmer = 0.6 + 0.4 * Math.abs(Math.sin(2 * Math.PI * 1.3 * t)); // loudness wobble
  buf[i] = (v * 0.02 * shimmer + (Math.random() - .5) * 0.02); // quiet, very breathy
}
const tr = new PitchTracker({ sampleRate: sr }); let on = 0, tot = 0, gaps = 0, prev = true;
for (let i = 0; i + 2048 <= n; i += 1440) { if (i / sr < 0.3) { tr.feed(buf.subarray(i, i + 2048)); continue; } const r = tr.feed(buf.subarray(i, i + 2048)); tot++; if (r.midi !== null) on++; if (prev && r.midi === null) gaps++; prev = r.midi !== null; }
const pct = Math.round(100 * on / tot);
console.log(`${pct >= 90 && gaps <= 2 ? 'PASS' : 'FAIL'}  rough held note: detected ${pct}% of the time, ${gaps} dropouts`);
process.exit(pct >= 90 && gaps <= 2 ? 0 : 1);
