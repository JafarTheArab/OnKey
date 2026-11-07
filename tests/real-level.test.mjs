// A voice at the real iPhone level (~0.007 RMS, measured from Justin's sample),
// soft singing at half that, and the same voice with a "TV" talking underneath.
import { PitchTracker } from '../js/audio/pitch.js';
const sr = 48000;
function mix({ secs = 3, voice = 0.007, tv = 0, noise = 0.0003, f0 = 180 }) {
  const n = sr * secs, b = new Float32Array(n); let p = 0, q = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    p += 2 * Math.PI * f0 * 2 ** (0.25 * Math.sin(2 * Math.PI * 5.5 * t) / 12) / sr;
    let v = 0; [1, .7, .5, .35, .25, .15].forEach((a, k) => (v += a * Math.sin((k + 1) * p)));
    // TV: a talking voice gliding around 120-260 Hz, syllables switching on and off
    const tf = 190 + 70 * Math.sin(2 * Math.PI * 0.9 * t) + 30 * Math.sin(2 * Math.PI * 3.1 * t);
    q += 2 * Math.PI * tf / sr;
    let w = 0; [1, .8, .6, .4].forEach((a, k) => (w += a * Math.sin((k + 1) * q)));
    const syll = Math.sin(2 * Math.PI * 4 * t) > -0.2 ? 1 : 0;
    b[i] = v * voice * 0.62 + w * tv * 0.7 * syll + (Math.random() - .5) * noise * 3.4;
  }
  return b;
}
let fail = 0;
for (const [name, opt, need] of [
  ['your real level', {}, 95],
  ['soft (half your level)', { voice: 0.0035 }, 90],
  ['TV underneath (1/3 your level)', { tv: 0.0023 }, 80],
  ['loud TV (2/3 your level)', { tv: 0.0047 }, 0],
]) {
  const b = mix(opt), tr = new PitchTracker({ sampleRate: sr }); let on = 0, right = 0, tot = 0;
  for (let i = 0; i + 2048 <= b.length; i += 1440) {
    const r = tr.feed(b.subarray(i, i + 2048)); if (i / sr < 0.4) continue; tot++;
    if (r.midi !== null) { on++; if (Math.abs(r.midi - 53.45) < 0.5) right++; }
  }
  const pct = Math.round(100 * right / tot), wrong = on - right;
  const ok = pct >= need && (need === 0 || wrong <= 2);
  if (!ok) fail++;
  console.log(`${need === 0 ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${name.padEnd(32)} on your note ${pct}% · wrong notes ${wrong}`);
}
// Room noise alone must not draw a line
{ const b = mix({ voice: 0 }), tr = new PitchTracker({ sampleRate: sr }); let fp = 0;
  for (let i = 0; i + 2048 <= b.length; i += 1440) if (tr.feed(b.subarray(i, i + 2048)).midi !== null) fp++;
  console.log(`${fp ? 'FAIL' : 'PASS'}  quiet room alone: false notes ${fp}`); if (fp) fail++; }
process.exit(fail ? 1 : 0);
