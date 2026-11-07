// YIN pitch detection tuned for singing voice.
// Pure functions, no DOM: reusable by Keyfall and by tests.

/**
 * Detect the fundamental frequency of `buf` (Float32Array, mono).
 * Returns { freq, clarity } or null when no clear pitch is found.
 * clarity is 0..1 (1 = perfectly periodic).
 */
export function yin(buf, sampleRate, { minFreq = 60, maxFreq = 1100, threshold = 0.15 } = {}) {
  const maxLag = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const W = buf.length - maxLag;
  if (W < 64) return null;
  const d = new Float32Array(maxLag + 1);

  // Difference function
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      sum += x * x;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalized difference
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  // First dip below threshold (absolute threshold step), then walk to its local minimum
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxLag && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) {
    // No dip under threshold: take global min but only if reasonably periodic
    let best = minLag;
    for (let t = minLag; t <= maxLag; t++) if (d[t] < d[best]) best = t;
    if (d[best] > Math.max(0.3, threshold + 0.15)) return null;
    tau = best;
  }
  // Parabolic interpolation
  let betterTau = tau;
  if (tau > 1 && tau < maxLag) {
    const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }
  return { freq: sampleRate / betterTau, clarity: Math.max(0, 1 - d[tau]) };
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * Stateful tracker: adaptive noise gate + octave-jump guard + light smoothing.
 * feed() returns { midi, freq, level, voiced } where midi is fractional (null if silent).
 */
export class PitchTracker {
  constructor({ sampleRate, quiet = false } = {}) {
    this.sampleRate = sampleRate;
    this.quiet = quiet;
    this.noiseFloor = 0.002;
    this.recent = []; // last raw midi values for median
    this.smoothed = null;
    this.silentFrames = 0;
    this.octaveRun = 0;
  }

  feed(buf) {
    const level = rms(buf);
    const gate = Math.max(this.quiet ? 0.0015 : 0.003, this.noiseFloor * 2.5);
    // Hysteresis: once a note is going, keep following it through rough or softer moments
    const holding = this.smoothed !== null && this.silentFrames < 4;
    const needLevel = holding ? gate * 0.6 : gate;
    const needClarity = holding ? 0.55 : 0.72;

    let midi = null, freq = null, periodic = false, reason = null;
    this.raw = null;
    if (level <= needLevel) reason = 'quiet';
    else {
      const r = yin(buf, this.sampleRate, holding ? { threshold: 0.25 } : undefined);
      this.raw = r; // what the detector found, even if rejected (shown on screen for diagnosis)
      periodic = !!(r && r.clarity > needClarity);
      if (!periodic) reason = 'unclear';
      if (periodic) {
        freq = r.freq;
        midi = freqToMidi(freq);
        // Octave-jump guard: if we jump ~12 semitones from a stable recent pitch, fold back
        if (this.smoothed !== null && this.recent.length >= 3) {
          const diff = midi - this.smoothed;
          if (Math.abs(Math.abs(diff) - 12) < 1.0 && this.octaveRun < 4) {
            // Brief octave flips are usually detection errors; a sustained one is a real jump
            this.octaveRun++;
            midi -= Math.sign(diff) * 12;
            freq = midiToFreq(midi);
          } else if (Math.abs(Math.abs(diff) - 12) < 1.0) {
            this.octaveRun = 0;
            this.recent = [];
            this.smoothed = null;
          } else {
            this.octaveRun = 0;
          }
        }
      }
    }
    // Adaptive noise floor: learns only from frames without a clear pitch (room noise),
    // falls quickly, rises slowly, so loud singing never raises the gate.
    if (!periodic) {
      if (level < this.noiseFloor) this.noiseFloor = this.noiseFloor * 0.8 + level * 0.2;
      else this.noiseFloor = Math.min(0.05, this.noiseFloor * 0.99 + level * 0.01);
    }

    if (midi === null) {
      this.silentFrames++;
      if (this.silentFrames > 4) { this.recent = []; this.smoothed = null; }
      return { midi: null, freq: null, level, gate, voiced: false, reason, raw: this.raw };
    }
    this.silentFrames = 0;
    this.recent.push(midi);
    if (this.recent.length > 5) this.recent.shift();
    const med = median(this.recent);
    // Use median to reject single-frame spikes, then light exponential smoothing
    const target = Math.abs(midi - med) > 1.5 ? med : midi;
    this.smoothed = this.smoothed === null ? target : this.smoothed * 0.5 + target * 0.5;
    return { midi: this.smoothed, rawMidi: midi, freq, level, gate, voiced: true, raw: this.raw };
  }
}

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
