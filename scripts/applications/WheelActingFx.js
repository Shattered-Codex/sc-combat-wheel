import { particleBox } from "../helpers/view-layout.js";

/**
 * RF-112: the layer that carries the acting portrait's effects outside it —
 * glow, halo, aura, flame, rays and the turn-change waves. The portrait clips
 * whatever is drawn inside it (a slice's sector, a card's frame), so these sit
 * just behind the acting slot instead, where nothing cuts them. Built once and
 * only moved when the layout changes; effects.css shows and animates its parts
 * from the root's data-scw-acting-fx / data-scw-turn-fx.
 */
export default class WheelActingFx {
  #layer = null;
  #signature = "";

  /**
   * @param {HTMLElement} root  the widget's zero-size anchor
   * @param {object} layout     layoutFromSettings() output
   * @param {string} orientation
   */
  update(root, layout, orientation) {
    if (!root || !layout) return;
    const layer = this.#attachLayer(root);
    const box = particleBox(layout, orientation, "acting");
    const shape = layout.view === "wheel" ? "round" : "card";
    const signature = [box.x, box.y, box.width, box.height, shape].map((value) => (typeof value === "number" ? value.toFixed(1) : value)).join(":");
    if (signature === this.#signature) return;
    this.#signature = signature;
    layer.dataset.shape = shape;
    layer.style.left = `${(box.x - box.width / 2).toFixed(1)}px`;
    layer.style.top = `${(box.y - box.height / 2).toFixed(1)}px`;
    layer.style.width = `${box.width.toFixed(1)}px`;
    layer.style.height = `${box.height.toFixed(1)}px`;
  }

  destroy() {
    this.#layer?.remove();
    this.#layer = null;
    this.#signature = "";
  }

  /** Every part exists from the start, hidden until the look asks for it, so switching effects never rebuilds. */
  #attachLayer(root) {
    if (!this.#layer) {
      const layer = document.createElement("div");
      layer.className = "scw-afx";
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = `
        <i class="scw-afx-glow"></i>
        <i class="scw-afx-halo"></i>
        <i class="scw-afx-aura"><b></b><b></b><b></b></i>
        <i class="scw-afx-flame"><b></b><b></b><b></b></i>
        <i class="scw-afx-rays"></i>
        <i class="scw-afx-waves"><b></b><b></b><b></b></i>
        <i class="scw-afx-burst"></i>`;
      this.#layer = layer;
    }
    // First in the root: everything else (the slots above all) is drawn over it.
    if (this.#layer.parentElement !== root || root.firstElementChild !== this.#layer) root.prepend(this.#layer);
    return this.#layer;
  }
}
