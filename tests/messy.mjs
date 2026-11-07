// How "clear" does YIN think messy voices are? Prints clarity spread.
import { yin } from '../js/audio/pitch.js';
const sr = 48000;
function voice({ f0 = 110, jitter = 0.03, noise = 0.3, h2 = 1.5, secs = 2 }) {
  const n = sr * secs, b = new Float32Array(n); let ph = 0, j = 0;
  for (let i = 0; i < n; i++) {
    if (i % 200 === 0) j = (Math.random() - .5) * jitter;
    ph += 2 * Math.PI * f0 * (1 + j) / sr;
    let v = Math.sin(ph) + h2 * Math.sin(2 * ph) + .8 * Math.sin(3 * ph) + .4 * Math.sin(4 * ph) + .3 * Math.sin(5 * ph);
    b[i] = v * 0.05 + (Math.random() - .5) * noise * 0.1;
  }
  return b;
}
for (const [name, opt] of [['clean hum A2', { noise: 0.05, jitter: 0.005 }], ['typical voice', {}], ['rough/noisy room', { noise: 0.6, jitter: 0.06 }], ['strong 2nd harmonic', { h2: 3 }], ['low E2 noisy', { f0: 82, noise: 0.5, jitter: 0.04 }]]) {
  const b = voice(opt); const cl = [], fr = [];
  for (let i = 0; i + 2048 <= b.length; i += 1440) { const r = yin(b.subarray(i, i + 2048), sr, { threshold: 0.3 }); if (r) { cl.push(r.clarity); fr.push(r.freq); } }
  cl.sort(); const q = (p) => cl.length ? cl[Math.floor(p * (cl.length - 1))].toFixed(2) : '-';
  const okF = fr.filter((f) => Math.abs(1200 * Math.log2(f / (opt.f0 || 110))) < 50).length;
  console.log(`${name.padEnd(20)} found ${cl.length}/${Math.floor((b.length - 2048) / 1440) + 1}  clarity low/med/high ${q(.1)}/${q(.5)}/${q(.9)}  right note ${okF}`);
}
