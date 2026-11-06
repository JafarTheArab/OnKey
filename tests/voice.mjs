// Voice-like synth: fundamental + decaying harmonics with formant-ish emphasis, vibrato, breath noise
export function synth(sr, segments) {
  const out = [];
  let phase = 0;
  for (const s of segments) {
    const n = Math.round(s.dur * sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (!s.midi && !s.from) { out.push((Math.random() - .5) * 0.002); continue; }
      let midi = s.from !== undefined ? s.from + (s.to - s.from) * (t / s.dur) : s.midi;
      midi += (s.cents || 0) / 100 + 0.3 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.3);
      const f = 440 * 2 ** ((midi - 69) / 12);
      phase += 2 * Math.PI * f / sr;
      let v = 0;
      const amps = [1, .7, .5, .45, .3, .2, .15, .1];
      amps.forEach((a, k) => v += a * Math.sin((k + 1) * phase));
      const env = Math.min(1, t / 0.05, (s.dur - t) / 0.05);
      out.push((v * 0.12 + (Math.random() - .5) * 0.02) * env * (s.amp || 1));
    }
  }
  return Float32Array.from(out);
}
export function wav(samples, sr) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return b;
}
