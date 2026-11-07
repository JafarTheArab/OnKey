// Usage: node tests/analyze-sample.mjs <file.wav>
// Runs the real detector over a sample shared from the phone and summarises what it saw.
import fs from 'fs';
import { PitchTracker, yin, rms } from '../js/audio/pitch.js';
const b = fs.readFileSync(process.argv[2]);
const sr = b.readUInt32LE(24), bits = b.readUInt16LE(34), ch = b.readUInt16LE(22);
let off = 12; while (b.toString('ascii', off, off + 4) !== 'data') off += 8 + b.readUInt32LE(off + 4);
const n = b.readUInt32LE(off + 4) / 2 / ch, x = new Float32Array(n);
for (let i = 0; i < n; i++) x[i] = b.readInt16LE(off + 8 + i * 2 * ch) / 32768;
console.log(`rate ${sr} Hz, ${bits}-bit, ${ch} ch, ${(n / sr).toFixed(1)} s, peak ${x.reduce((m, v) => Math.max(m, Math.abs(v)), 0).toFixed(3)}`);
let zeros = 0; for (let i = 0; i < n; i++) if (x[i] === 0) zeros++;
console.log(`exact-zero samples: ${(100 * zeros / n).toFixed(1)}%`);
const tr = new PitchTracker({ sampleRate: sr }); const rows = []; const counts = { voiced: 0, quiet: 0, unclear: 0 };
for (let i = 0; i + 2048 <= n; i += 1440) {
  const f = x.subarray(i, i + 2048), r = tr.feed(f), y = yin(f, sr, { threshold: 0.35 });
  counts[r.midi !== null ? 'voiced' : r.reason]++;
  rows.push(`${(i / sr).toFixed(2)}s lvl ${rms(f).toFixed(4)} gate ${r.gate.toFixed(4)} yin ${y ? Math.round(y.freq) + 'Hz c' + y.clarity.toFixed(2) : '-'} -> ${r.midi !== null ? r.midi.toFixed(2) : r.reason}`);
}
console.log(counts);
const step = Math.max(1, Math.floor(rows.length / 40)); rows.filter((_, i) => i % step === 0).forEach((r) => console.log(r));
