import { FLAME_STYLES, flameArc, flameTongues } from "../helpers/fx-flames.js";

/** Rebuild the tongues only when the box changes by more than this (px). */
const FLAME_STEP = 8;

/**
 * RF-112, RF-116: a layer of effects drawn around something without being
 * clipped by it. The "acting" one sits just behind the acting slot (a slice's
 * sector or a card's frame would cut whatever is drawn inside it) and carries
 * its aura, waves and the turn-change effects; the "widget" one lies around
 * the whole widget — the wheel's rim, or the row of cards — under everything.
 * effects.css shows and animates the parts from the layer's data-fx (the
 * looping effect), data-waves, data-shape ("round" or "card") and data-side
 * (which half of a round outline shows past the bar), and the turn effects
 * from the root's data-scw-turn-fx. Every part exists from the start, so
 * switching effects never rebuilds; only the flame tongues are built, for
 * the flame auras, again when the box really changes size.
 */
export default class WheelFxLayer {
  #role;
  #layer = null;
  #placement = "";
  #flames = "";

  /** @param {"acting"|"widget"} role */
  constructor(role) {
    this.#role = role;
  }

  /**
   * @param {HTMLElement} root  the widget's zero-size anchor
   * @param {object} options    WheelAppearance.actingFxOptions() / widgetFxOptions()
   * @param {{x: number, y: number, width: number, height: number}} options.box  centre and size around the anchor, in px
   * @param {"round"|"card"} options.shape
   * @param {string} [options.effect]  the looping effect, or "none"
   * @param {string} [options.waves]   continuous waves, or "none"
   * @param {string|null} [options.side]  a round outline's visible half (the widget on the wheel), null for all of it
   * @param {number} [options.scale]   size multiplier of the tongues (FX_BOOST)
   */
  update(root, { box, shape, effect = "none", waves = "none", side = null, scale = 1 } = {}) {
    // The widget's layer only exists while it draws something; the acting one also carries the turn effects.
    if (!root || !box || (this.#role === "widget" && effect === "none")) return this.destroy();
    const layer = this.#attach(root);
    layer.dataset.shape = shape;
    layer.dataset.fx = effect;
    layer.dataset.waves = waves;
    if (side) layer.dataset.side = side;
    else delete layer.dataset.side;

    const placement = [box.x, box.y, box.width, box.height].map((value) => value.toFixed(1)).join(":");
    if (placement !== this.#placement) {
      this.#placement = placement;
      layer.style.left = `${(box.x - box.width / 2).toFixed(1)}px`;
      layer.style.top = `${(box.y - box.height / 2).toFixed(1)}px`;
      layer.style.width = `${box.width.toFixed(1)}px`;
      layer.style.height = `${box.height.toFixed(1)}px`;
    }
    this.#syncFlames(layer, { box, shape, effect, side, scale });
  }

  destroy() {
    this.#layer?.remove();
    this.#layer = null;
    this.#placement = "";
    this.#flames = "";
  }

  #syncFlames(layer, { box, shape, effect, side, scale }) {
    const container = layer.querySelector(".scw-afx-tongues");
    const step = (value) => Math.round(value / FLAME_STEP);
    const signature = FLAME_STYLES.includes(effect) ? [effect, shape, side, scale, step(box.width), step(box.height)].join("|") : "";
    if (signature === this.#flames) return;
    this.#flames = signature;
    if (!signature) return container.replaceChildren();
    const tongues = flameTongues({ shape, width: box.width, height: box.height, arc: flameArc(side), style: effect, scale });
    container.replaceChildren(...tongues.map((vars) => {
      const tongue = document.createElement("b");
      tongue.className = "scw-afx-ff";
      tongue.style.cssText = Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(";");
      return tongue;
    }));
  }

  /**
   * Under everything else of the root: the widget's layer first, the acting
   * one right after it. Only placed once — moving a node restarts its animations.
   */
  #attach(root) {
    if (!this.#layer) {
      const layer = document.createElement("div");
      layer.className = `scw-afx scw-afx--${this.#role}`;
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = `
        <i class="scw-afx-glow"></i>
        <i class="scw-afx-halo"></i>
        <i class="scw-afx-aura"><b></b><b></b><b></b></i>
        <i class="scw-afx-flame"><b></b><b></b><b></b></i>
        <i class="scw-afx-void"><b></b><b></b><b></b></i>
        <i class="scw-afx-tongues"></i>
        <i class="scw-afx-rays"></i>
        <i class="scw-afx-storm"><b></b><b></b><b></b><b></b></i>
        <i class="scw-afx-runes"><b></b><b></b><b></b><b></b></i>
        <i class="scw-afx-rings"><b></b><b></b><b></b></i>
        <i class="scw-afx-waves"><b></b><b></b><b></b></i>
        <i class="scw-afx-burst"></i>
        <i class="scw-afx-bolt"></i>`;
      this.#layer = layer;
    }
    if (this.#layer.parentElement !== root) {
      const widget = this.#role === "acting" ? root.querySelector(":scope > .scw-afx--widget") : null;
      if (widget) widget.after(this.#layer);
      else root.prepend(this.#layer);
    }
    return this.#layer;
  }
}
