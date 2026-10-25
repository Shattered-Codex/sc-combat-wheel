import { resolveSound } from "../helpers/sound-presets.js";

/** Loudest a synthesized layer may get, before the volume multipliers. */
const MAX_LAYER_GAIN = 0.25;

/**
 * Plays turn sounds (RF-52, RF-53): synthesized presets through Web Audio, or
 * a file through Foundry's interface channel. Always scaled by Foundry's
 * interface volume and silenced by its global mute: a file by the channel
 * itself, a synthesized sound (straight to the speakers) by hand. Failures
 * never throw.
 */
export default class SoundPlayer {
  #context = null;

  /**
   * @param {string} choice  a SOUND_CHOICES value
   * @param {string} file    path used when choice is "file"
   * @param {number} volume  0–1, the wheel's own volume
   * @returns {Promise<boolean>} whether something played
   */
  async play(choice, file, volume) {
    const sound = resolveSound(choice, file);
    const interfaceVolume = SoundPlayer.#interfaceVolume();
    if (!sound || volume <= 0 || interfaceVolume <= 0) return false;
    try {
      if (sound.kind === "synth") return await this.#playSynth(sound.layers, volume * interfaceVolume);
      // The interface channel applies its own volume: scaling here too would count it twice.
      return await SoundPlayer.#playFile(sound.src, volume);
    } catch (error) {
      console.debug("SC Combat Wheel | Could not play a turn sound.", error);
      return false;
    }
  }

  async #playSynth(layers, level) {
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass) return false;
    this.#context ??= new AudioContextClass();
    const context = this.#context;
    if (context.state !== "running") await context.resume();
    if (context.state !== "running") return false;

    const now = context.currentTime;
    for (const layer of layers) {
      const start = now + (layer.delay ?? 0);
      const end = start + layer.duration;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = layer.wave ?? "sine";
      oscillator.frequency.setValueAtTime(layer.frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, layer.endFrequency ?? layer.frequency), end);
      const peak = Math.max(0.0001, Math.min(MAX_LAYER_GAIN, layer.gain * level * 1.6));
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
    return layers.length > 0;
  }

  static async #playFile(src, level) {
    const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
    if (!helper?.play) return false;
    await helper.play({ src, volume: Math.min(1, level), autoplay: true, loop: false, channel: "interface" }, false);
    return true;
  }

  /** Foundry's interface volume, 0 when globally muted. */
  static #interfaceVolume() {
    if (game.audio?.globalMute) return 0;
    const value = game.settings.get("core", "globalInterfaceVolume");
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.5;
  }
}
