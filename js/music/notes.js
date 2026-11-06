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
