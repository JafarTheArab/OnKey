// Voice-like singing of a list of notes: harmonics, 5.5 Hz vibrato, breath noise, quick slides between notes.
// notes: [{ start (s), dur (s), midi, cents: (fractionThroughNote) => cents }]
import { wav } from './voice.mjs';
export function synthSong(sr, notes, { amp = 1, total } = {}) {
  const len = Math.ceil((total || notes[notes.length - 1].start + notes[notes.length - 1].dur + 1) * sr);
  const out = new Float32Array(len);
  let phase = 0;
  const amps = [1, .7, .5, .45, .3, .2, .15, .1];
  for (let k = 0; k < notes.length; k++) {
    const n = notes[k], next = notes[k + 1], prev = notes[k - 1];
    const legato = next && next.start - (n.start + n.dur) < 0.02;
    const fromPrev = prev && n.start - (prev.start + prev.dur) < 0.02;
    const i0 = Math.round(n.start * sr), i1 = Math.round((n.start + n.dur) * sr);
    for (let i = i0; i < i1 && i < len; i++) {
      const t = (i - i0) / sr, frac = t / n.dur;
      let midi = n.midi + (n.cents ? n.cents(frac) : 0) / 100;
      if (fromPrev && t < 0.06) midi = prev.midi + (midi - prev.midi) * (t / 0.06); // slide in
      midi += 0.3 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.4);
      phase += (2 * Math.PI * 440 * 2 ** ((midi - 69) / 12)) / sr;
      let v = 0; amps.forEach((a, h) => (v += a * Math.sin((h + 1) * phase)));
      const env = Math.min(1, fromPrev ? 1 : t / 0.05, legato ? 1 : (n.dur - t) / 0.06);
      out[i] = (v * 0.12 + (Math.random() - 0.5) * 0.02) * env * amp;
    }
  }
  for (let i = 0; i < len; i++) if (out[i] === 0) out[i] = (Math.random() - 0.5) * 0.002 * amp;
  return wav(out, sr);
}
