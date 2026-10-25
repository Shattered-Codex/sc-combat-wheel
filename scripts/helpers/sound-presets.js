/**
 * Synthesized turn sounds (RF-52): short, original tones built from oscillator
 * layers, so the module ships no audio files. Each layer is
 * { frequency, endFrequency?, delay?, duration, wave?, gain }.
 */
export const SYNTH_PRESETS = Object.freeze({
  chime: [
    { frequency: 1318, duration: 0.5, wave: "sine", gain: 0.12 },
    { frequency: 1975, delay: 0.09, duration: 0.55, wave: "sine", gain: 0.07 },
  ],
  bell: [
    { frequency: 523, duration: 1.1, wave: "sine", gain: 0.16 },
    { frequency: 1046, duration: 0.8, wave: "sine", gain: 0.06 },
    { frequency: 1567, delay: 0.01, duration: 0.5, wave: "triangle", gain: 0.03 },
  ],
  gong: [
    { frequency: 98, endFrequency: 92, duration: 1.8, wave: "sine", gain: 0.2 },
    { frequency: 196, endFrequency: 180, duration: 1.4, wave: "triangle", gain: 0.08 },
    { frequency: 311, duration: 0.9, wave: "sine", gain: 0.05 },
  ],
  drum: [
    { frequency: 140, endFrequency: 48, duration: 0.35, wave: "sine", gain: 0.22 },
    { frequency: 150, endFrequency: 52, delay: 0.18, duration: 0.3, wave: "sine", gain: 0.16 },
  ],
  arcane: [
    { frequency: 880, endFrequency: 1320, duration: 0.35, wave: "sine", gain: 0.1 },
    { frequency: 1320, endFrequency: 1760, delay: 0.08, duration: 0.4, wave: "sine", gain: 0.06 },
    { frequency: 2217, delay: 0.16, duration: 0.45, wave: "sine", gain: 0.03 },
  ],
  blip: [
    { frequency: 1480, endFrequency: 1480, duration: 0.07, wave: "square", gain: 0.07 },
    { frequency: 1975, delay: 0.09, duration: 0.09, wave: "square", gain: 0.06 },
  ],
  scan: [{ frequency: 380, endFrequency: 2400, duration: 0.42, wave: "sawtooth", gain: 0.05 }],
  alert: [
    { frequency: 740, duration: 0.14, wave: "square", gain: 0.07 },
    { frequency: 554, delay: 0.17, duration: 0.14, wave: "square", gain: 0.07 },
    { frequency: 740, delay: 0.34, duration: 0.14, wave: "square", gain: 0.07 },
  ],
  harp: [
    { frequency: 523, duration: 0.6, wave: "triangle", gain: 0.1 },
    { frequency: 659, delay: 0.08, duration: 0.6, wave: "triangle", gain: 0.09 },
    { frequency: 784, delay: 0.16, duration: 0.6, wave: "triangle", gain: 0.08 },
    { frequency: 1046, delay: 0.24, duration: 0.8, wave: "triangle", gain: 0.07 },
  ],
  fanfare: [
    { frequency: 392, duration: 0.16, wave: "sawtooth", gain: 0.05 },
    { frequency: 523, delay: 0.17, duration: 0.16, wave: "sawtooth", gain: 0.05 },
    { frequency: 659, delay: 0.34, duration: 0.45, wave: "sawtooth", gain: 0.06 },
    { frequency: 659, delay: 0.34, duration: 0.45, wave: "sine", gain: 0.06 },
  ],
  horn: [
    { frequency: 147, endFrequency: 155, duration: 1.1, wave: "sawtooth", gain: 0.06 },
    { frequency: 294, endFrequency: 310, duration: 1.0, wave: "triangle", gain: 0.05 },
  ],
  pluck: [{ frequency: 880, endFrequency: 860, duration: 0.25, wave: "triangle", gain: 0.12 }],
  sparkle: [
    { frequency: 2093, duration: 0.18, wave: "sine", gain: 0.05 },
    { frequency: 2637, delay: 0.06, duration: 0.18, wave: "sine", gain: 0.05 },
    { frequency: 3136, delay: 0.12, duration: 0.22, wave: "sine", gain: 0.04 },
    { frequency: 4186, delay: 0.18, duration: 0.3, wave: "sine", gain: 0.03 },
  ],
  heartbeat: [
    { frequency: 70, endFrequency: 45, duration: 0.18, wave: "sine", gain: 0.25 },
    { frequency: 65, endFrequency: 42, delay: 0.24, duration: 0.2, wave: "sine", gain: 0.2 },
  ],
  whoosh: [{ frequency: 180, endFrequency: 1400, duration: 0.45, wave: "sawtooth", gain: 0.035 }],
  rewind: [
    { frequency: 1200, endFrequency: 300, duration: 0.3, wave: "triangle", gain: 0.07 },
    { frequency: 900, endFrequency: 250, delay: 0.12, duration: 0.25, wave: "triangle", gain: 0.05 },
  ],
});

/** Sounds that already ship with Foundry core. */
export const CORE_SOUNDS = Object.freeze({
  coreNotify: "sounds/notify.wav",
  coreDrums: "sounds/drums.wav",
  coreLock: "sounds/lock.wav",
  coreDice: "sounds/dice.wav",
});

/** Every choice a sound event can take, in menu order. */
export const SOUND_CHOICES = Object.freeze(["off", ...Object.keys(SYNTH_PRESETS), ...Object.keys(CORE_SOUNDS), "file"]);

/**
 * What to play for a choice: `{ kind: "synth", layers }`, `{ kind: "file", src }`,
 * or null for "off", an unknown value, or a file choice without a path.
 */
export function resolveSound(choice, file) {
  if (SYNTH_PRESETS[choice]) return { kind: "synth", layers: SYNTH_PRESETS[choice] };
  if (CORE_SOUNDS[choice]) return { kind: "file", src: CORE_SOUNDS[choice] };
  if (choice === "file" && file) return { kind: "file", src: file };
  return null;
}
