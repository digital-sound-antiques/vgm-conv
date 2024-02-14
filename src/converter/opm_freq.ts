export type OPMNote = {
  kc: number;
  kf: number;
};

const BASE_FREQ = 277.2; // C#4 = 60
//                 C# D D#  E  F  F# G  G# A   A#  B   C
const KEY_TO_NOTE = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];

// clockRatio should be `3579545 / (Output OPM Clock)`
export function freqToOPMNote(freq: number, clockRatio: number): OPMNote {
  if (freq == 0 || freq == Infinity) {
    return { kc: 0, kf: 0 };
  }
  const key = Math.max(0, 60 + Math.log2((freq * clockRatio) / BASE_FREQ) * 12);
  const frac = key - Math.floor(key);
  const kf = Math.floor(frac * 64);
  const note = KEY_TO_NOTE[Math.floor(key) % 12];
  const oct = Math.floor(key / 12);
  return { kc: (oct << 4) | note, kf };
}
