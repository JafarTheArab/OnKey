// Note naming helpers.
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** 60 -> "C4" */
export function midiName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Cents away from the nearest note: -50..+50 */
export function centsOff(midi) {
  return Math.round((midi - Math.round(midi)) * 100);
}

export const isNatural = (m) => [0, 2, 4, 5, 7, 9, 11].includes(((m % 12) + 12) % 12);

/** "D4" / "C#3" / "Bb2" -> MIDI number */
export function nameToMidi(name) {
  const m = /^([A-G])([#♯b♭]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note name ' + name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
  return base + acc + (Number(m[3]) + 1) * 12;
}
