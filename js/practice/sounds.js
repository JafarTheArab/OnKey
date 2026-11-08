// Simple built-in sounds: metronome click and a soft "guide" voice for the melody.
// No library yet (a proper instrument/voice soundfont comes in Stage 1b, with your OK).
import { output } from '../audio/engine.js';
import { midiToFreq } from '../audio/pitch.js';

/** A volume knob for one practice session; disconnect() silences anything still scheduled. */
export function makeBus(ac) {
  const g = ac.createGain();
  g.gain.value = 1;
  g.connect(output());
  return g;
}

export function click(ac, bus, t, accent = false, vol = 1) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  const v = (accent ? 0.22 : 0.14) * vol;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + 0.06);
}

/** Soft, slightly breathy "oo" voice: two detuned triangles through a low-pass, with gentle vibrato. */
export function guideNote(ac, bus, t, dur, midi, vol = 1) {
  const f = midiToFreq(midi);
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(2400, f * 5); lp.Q.value = 0.7;
  const peak = 0.16 * vol, a = Math.min(0.06, dur * 0.3), r = Math.min(0.12, dur * 0.3);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak * 0.85, Math.max(t + a, t + dur - r));
  g.gain.linearRampToValueAtTime(0, t + dur);
  const vib = ac.createOscillator(), vibAmt = ac.createGain();
  vib.frequency.value = 5.3; vibAmt.gain.value = 0;
  if (dur > 0.6) { vibAmt.gain.setValueAtTime(0, t + 0.35); vibAmt.gain.linearRampToValueAtTime(f * 0.006, t + 0.7); }
  vib.connect(vibAmt);
  for (const det of [-4, 4]) {
    const o = ac.createOscillator();
    o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
    vibAmt.connect(o.frequency);
    o.connect(lp);
    o.start(t); o.stop(t + dur + 0.02);
  }
  vib.start(t); vib.stop(t + dur + 0.02);
  lp.connect(g).connect(bus);
}
