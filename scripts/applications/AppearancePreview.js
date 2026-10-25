import { ANIMATION_SPEED, TEMPLATE_ROOT } from "../constants/module-constants.js";
import { widgetBounds } from "../helpers/wheel-geometry.js";
import { layoutFromSettings } from "../helpers/view-layout.js";
import { normalizeOrientation } from "../helpers/orientation.js";
import WheelAnimator from "./WheelAnimator.js";
import WheelAppearance from "./WheelAppearance.js";
import WheelParticles from "./WheelParticles.js";
import WheelActingFx from "./WheelActingFx.js";
import WheelRenderer from "./WheelRenderer.js";
import WheelViewData from "./WheelViewData.js";

/** Room kept between the widget and the edge of the stage. */
const STAGE_PADDING = 16;
/** How long the sample strip runs past the end of the bar (head and four members). */
const STRIP_LENGTH = 300;
const NO_HANDLERS = Object.freeze({ onClick() {}, onHoverIn() {}, onHoverOut() {}, onRollOne() {} });
/** The settings layoutFromSettings() reads; only they rebuild the slices. */
const LAYOUT_KEYS = Object.freeze([
  "view", "layoutPreset", "customOuter", "customInner", "customStep", "anchor", "portraitShape", "sliceGap",
  "orientation", "trackSize", "trackShape", "trackReach", "trackSpacing",
]);

/**
 * The live wheel of the appearance editor (RF-73): the real renderer,
 * animator, hub and bar, drawn from unsaved values and zoomed down to fit its
 * stage. The stage is inert, so nothing in it reacts to the pointer.
 */
export default class AppearancePreview {
  #stage;
  #root;
  #wheel;
  #hub;
  #bar;
  #renderer = new WheelRenderer();
  #particles = new WheelParticles();
  #actingFx = new WheelActingFx();
  #lastT = null;
  #animator = new WheelAnimator(this.#renderer);
  #layout = null;
  #layoutSignature = "";
  #state = null;
  #partsSignature = "";
  /** Drops template renders that finish after a newer one started. */
  #partsToken = 0;
  #observer = null;
  #probe = null;
  #onFit;

  /**
   * @param {HTMLElement} stage
   * @param {object} [options]
   * @param {(shown: number, wanted: number) => void} [options.onFit]  scale drawn vs. scale asked for
   */
  constructor(stage, { onFit = () => {} } = {}) {
    this.#stage = stage;
    this.#onFit = onFit;
    this.#root = document.createElement("div");
    this.#root.className = "sc-combat-wheel scw-preview";
    this.#wheel = document.createElement("div");
    this.#wheel.className = "scw-wheel";
    this.#hub = document.createElement("div");
    this.#bar = document.createElement("div");
    this.#root.append(this.#wheel, this.#hub, this.#bar);
    stage.replaceChildren(this.#root);
    if (typeof ResizeObserver === "function") {
      this.#observer = new ResizeObserver(() => this.#fit());
      this.#observer.observe(stage);
    }
  }

  /**
   * @param {object} state
   * @param {object} state.values     appearance values by setting key (the editor's draft)
   * @param {string} state.theme      resolved theme id
   * @param {object} state.model      WheelModel to draw
   * @param {boolean} state.expanded  whether the bar shows its details
   * @param {object|null} [state.phase]  a Venaerys phase to show the strip of (RF-82)
   */
  update({ values, theme, model, expanded, phase = null }) {
    const orientation = normalizeOrientation(values.orientation);
    const layoutSignature = JSON.stringify(LAYOUT_KEYS.map((key) => values[key]));
    if (layoutSignature !== this.#layoutSignature) {
      this.#layoutSignature = layoutSignature;
      this.#layout = layoutFromSettings(values);
      this.#animator.reset();
      this.#renderer.mount(this.#wheel, this.#layout, NO_HANDLERS);
    }
    this.#state = { values, orientation, expanded: Boolean(expanded), strip: Boolean(phase) };

    WheelAppearance.applyGeometry(this.#root, this.#layout);
    WheelAppearance.applyLook(this.#root, values, { orientation, theme, expanded });
    this.#particles.update(this.#root, WheelAppearance.particleOptions(values, this.#layout, orientation, model));
    this.#actingFx.update(this.#root, this.#layout, orientation);
    // Stepping the sample turn shows the turn effect, as the table would see it.
    if (this.#lastT !== null && model.T !== this.#lastT) WheelAppearance.playTurnEffect(this.#root);
    this.#lastT = model.T;
    this.#fit();
    this.#animator.show(model, {
      speed: ANIMATION_SPEED[values.animationSpeed] ?? 1,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });

    const bar = { controls: values.barControls, layout: values.barLayout, details: !(values.barHidden ?? []).includes("details"), stripImage: values.phaseStripImage, barHidden: values.barHidden };
    // The layout too: the split bar's pods are sized from its depth (fitPods).
    const partsSignature = JSON.stringify([model.combatId, model.T, model.N, orientation, Boolean(expanded), bar, Boolean(phase), this.#layoutSignature]);
    if (partsSignature !== this.#partsSignature) {
      this.#partsSignature = partsSignature;
      void this.#renderParts(model, { orientation, expanded: Boolean(expanded), phase, ...bar });
    }
  }

  /**
   * RF-115: the colours the widget actually draws with — theme, the user's own
   * colours and the mixes resolved — as the browser computes them, for the
   * editor's contrast check. A hidden probe reads them inside the root.
   */
  resolvedColors() {
    if (!this.#probe) {
      this.#probe = document.createElement("span");
      this.#probe.className = "scw-color-probe";
      this.#probe.setAttribute("aria-hidden", "true");
      this.#probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;color:var(--scw-text);background-color:var(--scw-surface);border:0 solid var(--scw-accent);outline-color:var(--scw-bg)";
    }
    if (this.#probe.parentElement !== this.#root) this.#root.append(this.#probe);
    const style = getComputedStyle(this.#probe);
    return { text: style.color, surface: style.backgroundColor, accent: style.borderTopColor, background: style.outlineColor };
  }

  /** RF-102: brightens what one color role paints (theme-colors.js roles), or nothing with null. */
  highlight(role) {
    if (role) this.#root.dataset.scwHighlight = role;
    else delete this.#root.dataset.scwHighlight;
  }

  destroy() {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#partsToken++;
    this.#animator.reset();
    this.#renderer.unmount();
    this.#particles.destroy();
    this.#actingFx.destroy();
  }

  async #renderParts(model, { phase, ...options }) {
    const token = ++this.#partsToken;
    const ui = { ...options, locked: false, menu: null, rolling: false, viewIndex: null, virtualTemplates: [] };
    const barData = WheelViewData.bar(model, ui);
    if (phase && !barData.strip) barData.strip = WheelViewData.strip(phase, ui);
    const { renderTemplate } = foundry.applications.handlebars;
    const [hub, bar] = await Promise.all([
      renderTemplate(`${TEMPLATE_ROOT}/hub.hbs`, { hub: WheelViewData.hub(model, ui) }),
      renderTemplate(`${TEMPLATE_ROOT}/bar.hbs`, { bar: barData }),
    ]);
    if (token !== this.#partsToken) return;
    this.#hub.innerHTML = hub;
    this.#bar.innerHTML = bar;
    WheelAppearance.fitPods(this.#bar, this.#layout);
  }

  /** Grows `bounds` in place to hold the sample strip: its depth, or roughly its length past the bar's end. */
  static #withStrip(bounds, orientation, values) {
    const placement = values.phaseStripPlacement;
    const side = orientation === "left" || orientation === "right";
    const grown = bounds;
    if (placement === "end") {
      if (side) grown.maxY += STRIP_LENGTH;
      else grown.maxX += STRIP_LENGTH;
      return grown;
    }
    // "beyond" grows on the bar's side, "over" on the far side of the portraits.
    const key = { up: "maxY", down: "minY", right: "minX", left: "maxX" }[orientation];
    const far = { up: "minY", down: "maxY", right: "maxX", left: "minX" }[orientation];
    const edge = placement === "beyond" ? key : far;
    grown[edge] += Math.sign(grown[edge]) * WheelAppearance.stripDepth(values);
    return grown;
  }

  /** Grows `bounds` in place to hold a split bar's two columns, one past each end of the portraits. */
  static #withSplitColumns(bounds, orientation, layout) {
    const reach = layout.across + WheelAppearance.splitReach();
    if (orientation === "left" || orientation === "right") {
      bounds.minY = Math.min(bounds.minY, -reach);
      bounds.maxY = Math.max(bounds.maxY, reach);
    } else {
      bounds.minX = Math.min(bounds.minX, -reach);
      bounds.maxX = Math.max(bounds.maxX, reach);
    }
  }

  /** Centres the widget on the stage, shrinking it (never growing it) when it would not fit. */
  #fit() {
    if (!this.#layout || !this.#state) return;
    const { values, orientation, expanded, strip } = this.#state;
    const width = this.#stage.clientWidth - 2 * STAGE_PADDING;
    const height = this.#stage.clientHeight - 2 * STAGE_PADDING;
    if (width <= 0 || height <= 0) return;

    const barShown = values.barVisibility !== "hidden";
    const split = barShown && WheelAppearance.isSplit(values);
    const thickness = barShown && !split ? WheelAppearance.barThickness(orientation, expanded, values.barSize) : 0;
    // A split bar lies beside the portraits, not across them: only its columns count (RF-104).
    const bounds = widgetBounds(split ? { ...this.#layout, barWidth: 0 } : this.#layout, orientation, thickness);
    if (split) AppearancePreview.#withSplitColumns(bounds, orientation, this.#layout);
    if (strip) AppearancePreview.#withStrip(bounds, orientation, values);
    const boxWidth = bounds.maxX - bounds.minX;
    const boxHeight = bounds.maxY - bounds.minY;
    const wanted = (Number(values.scale) || 100) / 100;
    const shown = Math.min(wanted, width / boxWidth, height / boxHeight);
    this.#root.style.setProperty("--scw-scale", String(shown));
    this.#root.style.left = `${(STAGE_PADDING + (width - boxWidth * shown) / 2 - bounds.minX * shown).toFixed(1)}px`;
    this.#root.style.top = `${(STAGE_PADDING + (height - boxHeight * shown) / 2 - bounds.minY * shown).toFixed(1)}px`;
    this.#onFit(shown, wanted);
  }
}
