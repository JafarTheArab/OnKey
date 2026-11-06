import { PitchTracker } from '../js/audio/pitch.js';
import { synth } from './voice.mjs';
const sr = 48000;
const cases = [
  ['A3 on pitch', { midi: 57 }, 57],
  ['A3 30c flat', { midi: 57, cents: -30 }, 56.7],
  ['A3 25c sharp', { midi: 57, cents: 25 }, 57.25],
  ['A2 low male', { midi: 45 }, 45],
  ['F2 very low', { midi: 41 }, 41],
  ['E4 high', { midi: 64 }, 64],
  ['A4 (octave up)', { midi: 69 }, 69],
  ['G3 quiet (1/12 vol)', { midi: 55, amp: 1/12 }, 55],
];
let fail = 0;
for (const [name, seg, want] of cases) {
  const buf = synth(sr, [{ dur: 0.4 }, { dur: 2, ...seg }]);
  const tr = new PitchTracker({ sampleRate: sr });
  const vals = [];
  for (let i = 0; i + 2048 <= buf.length; i += 1440) {
    const r = tr.feed(buf.subarray(i, i + 2048));
    if (i / sr > 0.9 && i / sr < 2.2 && r.midi !== null) vals.push(r.midi);
  }
  const voiced = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, voiced);
  const errC = Math.round((mean - want) * 100);
  const octErr = vals.filter(v => Math.abs(v - want) > 6).length;
  const ok = voiced > 30 && Math.abs(errC) <= 5 && octErr === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} frames=${voiced} meanErr=${errC}¢ octaveErrors=${octErr}`);
}
// slide + real octave jump
const buf = synth(sr, [{ dur: 0.3 }, { dur: 1.5, from: 45, to: 64 }, { dur: 1, midi: 57 }, { dur: 1, midi: 45 }]);
const tr = new PitchTracker({ sampleRate: sr }); const seen = [];
for (let i = 0; i + 2048 <= buf.length; i += 1440) { const r = tr.feed(buf.subarray(i, i + 2048)); seen.push([i/sr, r.midi]); }
const at = (t) => { const v = seen.filter(([s, m]) => Math.abs(s - t) < 0.15 && m !== null).map(x => x[1]); return v.length ? (v.reduce((a,b)=>a+b)/v.length).toFixed(1) : 'none'; };
console.log(`slide: start≈${at(0.45)} mid≈${at(1.05)} end≈${at(1.7)} | A3 hold≈${at(2.5)} | jump to A2≈${at(3.5)} (want 45)`);
// loud singing followed by a soft note must still be heard
{ const b2 = synth(sr, [{ dur: 0.3 }, { dur: 4, midi: 57 }, { dur: 0.2 }, { dur: 1.2, midi: 55, amp: 0.1 }]);
  const t3 = new PitchTracker({ sampleRate: sr }); let soft = 0;
  for (let i = 0; i + 2048 <= b2.length; i += 1440) { const r = t3.feed(b2.subarray(i, i + 2048)); if (i / sr > 4.8 && r.midi !== null && Math.abs(r.midi - 55) < 0.5) soft++; }
  const ok = soft > 15; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  soft note after loud     frames=${soft}`); }
// silence should be silent
const sil = synth(sr, [{ dur: 2 }]); const t2 = new PitchTracker({ sampleRate: sr }); let falsePos = 0;
for (let i = 0; i + 2048 <= sil.length; i += 1440) if (t2.feed(sil.subarray(i, i + 2048)).midi !== null) falsePos++;
console.log(`${falsePos ? 'FAIL' : 'PASS'}  silence false detections: ${falsePos}`); if (falsePos) fail++;
process.exit(fail ? 1 : 0);
