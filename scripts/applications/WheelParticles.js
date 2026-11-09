import {
  PARTICLE_INTENSITIES,
  PARTICLE_PRESETS,
  PARTICLE_SPEEDS,
  buildParticles,
  particleSignature,
} from "../helpers/particle-presets.js";

const DEFAULT_COLOR = "var(--scw-accent)";

/**
 * The decorative particle layer of the widget: one absolutely positioned
 * `<div class="scw-fx">` under the widget's anchor, holding one `<i>` per
 * particle. Particles are rebuilt only when their signature changes (type,
 * amount, motion, scale, box size); speed, intensity and color are CSS variables on the
 * layer. Pure CSS animation: no timers, frames or listeners.
 */
export default class WheelParticles {
  #layer = null;
  #signature = "";
  #placement = "";

  /**
   * @param {HTMLElement} root - the widget's zero-size anchor
   * @param {object} options
   * @param {string} options.type - one of PARTICLE_TYPES ("none" removes the layer)
   * @param {string} [options.amount] - a key of PARTICLE_AMOUNTS
   * @param {string} [options.motion] - one of PARTICLE_MOTIONS
   * @param {number} [options.scale] - size and reach multiplier (FX_BOOST)
   * @param {string} [options.speed] - a key of PARTICLE_SPEEDS
   * @param {string} [options.intensity] - a key of PARTICLE_INTENSITIES
   * @param {{x: number, y: number, width: number, height: number}} options.box -
   *   emitter centre and size in px, relative to the anchor
   * @param {string} [options.color] - any CSS color
   */
  update(root, { type, amount, motion, scale, speed, intensity, box, color } = {}) {
    if (!root || !box || !PARTICLE_PRESETS[type]) {
      this.destroy();
      return;
    }
    const layer = this.#attachLayer(root);

    const signature = particleSignature({ type, amount, motion, scale, box });
    if (signature !== this.#signature) {
      this.#signature = signature;
      layer.className = `scw-fx scw-fx--${type}`;
      layer.replaceChildren(this.#particleFragment(buildParticles({ type, amount, motion, scale, box })));
    }

    const placement = `${box.x}|${box.y}|${box.width}|${box.height}`;
    if (placement !== this.#placement) {
      this.#placement = placement;
      layer.style.left = `${box.x - box.width / 2}px`;
      layer.style.top = `${box.y - box.height / 2}px`;
      layer.style.width = `${box.width}px`;
      layer.style.height = `${box.height}px`;
    }

    layer.style.setProperty("--scw-fx-speed", String(PARTICLE_SPEEDS[speed] ?? PARTICLE_SPEEDS.normal));
    layer.style.setProperty("--scw-fx-strength", String(PARTICLE_INTENSITIES[intensity] ?? PARTICLE_INTENSITIES.normal));
    layer.style.setProperty("--scw-fx-color", color || DEFAULT_COLOR);
  }

  destroy() {
    this.#layer?.remove();
    this.#layer = null;
    this.#signature = "";
    this.#placement = "";
  }

  #attachLayer(root) {
    if (!this.#layer) {
      this.#layer = document.createElement("div");
      this.#layer.className = "scw-fx";
      this.#layer.setAttribute("aria-hidden", "true");
      this.#layer.style.pointerEvents = "none";
    }
    if (this.#layer.parentElement !== root) root.append(this.#layer);
    return this.#layer;
  }

  #particleFragment(particles) {
    const fragment = document.createDocumentFragment();
    for (const { className, vars } of particles) {
      const element = document.createElement("i");
      element.className = className;
      element.style.cssText = Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(";");
      fragment.append(element);
    }
    return fragment;
  }
}
