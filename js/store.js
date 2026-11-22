// Everything OnKey remembers, saved on this device only (localStorage). No audio is ever stored here.
const KEY = 'onkey.v1';
const DEFAULTS = {
  range: null,        // { low, high, reachLow, reachHigh, date }
  latency: null,      // seconds between a sound playing and OnKey hearing you answer it
  settings: { strictness: 'normal', metronome: false, guide: true, names: true, autoSpeed: false, speed: 1, octave: null,
    part: 'melody', fit: false, othersOn: false, instruments: true },
  songs: {},          // id -> { runs: [{ date, score, avgAbs }], noteHist: { i: [credits] }, lastLine, best }
};

let data;
function load() {
  if (data) return data;
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { data = {}; }
  data = { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } };
  // 2026-11: "Auto" octave added and made the default; switch an earlier manual choice back to Auto once
  if (!data.octaveAutoV1) { data.settings.octave = null; data.octaveAutoV1 = true; save(); }
  return data;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {} }

export const store = {
  get: () => load(),
  set(patch) { Object.assign(load(), patch); save(); },
  settings: () => load().settings,
  setSetting(k, v) { load().settings[k] = v; save(); },
  song(id) { const d = load(); return (d.songs[id] = d.songs[id] || { runs: [], noteHist: {}, lastLine: 0, best: null }); },
  saveSong() { save(); },
};
