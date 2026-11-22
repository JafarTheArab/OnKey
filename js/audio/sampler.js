// Small sample player for OnKey's recorded sounds (Fluid R3 piano and voices, see sounds/CREDITS.md).
// Each instrument has a recording every 3 semitones; notes in between are played slightly faster or slower.
// Long voice notes crossfade into a second copy so they can be held as long as a song needs.
// All sound is sent to the `dest` node you pass (practice uses a bus connected to the engine's output()).
import { midiToFreq } from './pitch.js';

export const INSTRUMENTS = {
  piano: { dir: 'sounds/piano/', from: 33, to: 87, sustain: false, gain: 5 },
  oohs: { dir: 'sounds/oohs/', from: 36, to: 87, sustain: true, gain: 6 },
  aahs: { dir: 'sounds/aahs/', from: 36, to: 87, sustain: true, gain: 4.5 },
};
const STEP = 3;

const raw = new Map();         // url -> Promise<ArrayBuffer> (downloaded once per visit)
const decoded = new WeakMap(); // AudioContext -> Map(url -> AudioBuffer)

function fetchRaw(url) {
  if (!raw.has(url)) raw.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('missing ' + url); return r.arrayBuffer(); }));
  return raw.get(url);
}
const urls = (name) => { const I = INSTRUMENTS[name], out = []; for (let m = I.from; m <= I.to; m += STEP) out.push(I.dir + m + '.mp3'); return out; };

/** Start downloading (no sound engine needed). */
export function preload(names) { for (const n of names) urls(n).forEach(fetchRaw); }

/** Download (if needed) and decode instruments for this AudioContext. Resolves when ready. */
export async function load(ac, names) {
  let map = decoded.get(ac);
  if (!map) decoded.set(ac, (map = new Map()));
  await Promise.all(names.flatMap(urls).map(async (u) => {
    if (map.has(u)) return;
    const buf = (await fetchRaw(u)).slice(0); // decodeAudioData detaches the buffer, so decode a copy
    map.set(u, await new Promise((res, rej) => ac.decodeAudioData(buf, res, rej)));
  }));
}

export const isLoaded = (ac, name) => { const map = decoded.get(ac); return !!map && urls(name).every((u) => map.has(u)); };

/**
 * Play `midi` on instrument `name` at time t for dur seconds into dest.
 * vel: 0..1 loudness. Returns nothing; safe to call for notes outside the recorded range (they're clamped).
 */
export function play(ac, dest, name, midi, t, dur, vel = 1) {
  const I = INSTRUMENTS[name], map = decoded.get(ac);
  if (!map) return;
  const near = Math.min(I.to, Math.max(I.from, I.from + Math.round((midi - I.from) / STEP) * STEP));
  const buf = map.get(I.dir + near + '.mp3');
  if (!buf) return;
  const rate = midiToFreq(midi) / midiToFreq(near);
  const peak = I.gain * vel * 0.1;
  const release = I.sustain ? 0.12 : 0.25;
  const out = ac.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(peak, t + (I.sustain ? 0.04 : 0.005));
  out.gain.setValueAtTime(peak, Math.max(t + 0.05, t + dur));
  out.gain.linearRampToValueAtTime(0, t + dur + release);
  out.connect(dest);
  const end = t + dur + release + 0.02;
  if (!I.sustain) { start(ac, buf, rate, out, t, 0, end); return; }
  // Voices: each recording is ~3.1 s; for longer notes, crossfade into a copy started 1 s in
  const seg = (buf.duration - 0.6) / rate; // usable length of one copy
  let at = t, offset = 0;
  while (at < end) {
    const segEnd = Math.min(end, at + seg - offset / rate);
    const g = ac.createGain();
    const fadeIn = offset ? 0.25 : 0, fadeOut = segEnd < end ? 0.25 : 0;
    g.gain.setValueAtTime(fadeIn ? 0 : 1, at);
    if (fadeIn) g.gain.linearRampToValueAtTime(1, at + fadeIn);
    if (fadeOut) { g.gain.setValueAtTime(1, segEnd - fadeOut); g.gain.linearRampToValueAtTime(0, segEnd); }
    g.connect(out);
    start(ac, buf, rate, g, at, offset, segEnd + 0.01);
    if (segEnd >= end) break;
    at = segEnd - fadeOut; offset = 1.0;
  }
}

function start(ac, buf, rate, dest, t, offset, stopAt) {
  const s = ac.createBufferSource();
  s.buffer = buf; s.playbackRate.value = rate;
  s.connect(dest);
  s.start(t, offset);
  s.stop(stopAt);
}
