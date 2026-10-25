import { BAR_HEIGHT, COLOR_SETTINGS, PHASE_STRIP_ROOM, PHASE_STRIP_SIZES, SPLIT_POD, STYLE_SETTINGS, VIEWS } from "../constants/module-constants.js";
import { OVERRIDE_PROPERTIES, colorOverrides } from "../helpers/theme-colors.js";
import { STYLE_PROPERTIES, styleOverrides } from "../helpers/theme-style.js";
import { particleBox } from "../helpers/view-layout.js";
import { INTENSITY_AMOUNTS, PARTICLE_INTENSITIES, PARTICLE_SPEEDS } from "../helpers/particle-presets.js";
import { ORIENTATIONS, isSideOrientation } from "../helpers/orientation.js";

/** How long a turn-change effect may run (effects.css keeps them shorter). */
const TURN_FX_MS = 1200;
const TURN_FX_TIMERS = new WeakMap();

/**
 * The classes, data attributes and custom properties that draw a wheel root.
 * Shared by the widget and the appearance preview, so the preview is exactly
 * what the table sees.
 */
export default class WheelAppearance {
  /**
   * Geometry from layoutFromSettings(), for any view (RF-90); `scale` is the
   * root's overall zoom around its anchor.
   */
  static applyGeometry(element, layout, { scale = 1 } = {}) {
    const style = element.style;
    for (const view of VIEWS) element.classList.toggle(`scw-view-${view}`, layout.view === view);
    element.classList.toggle("scw-view-track", layout.view !== "wheel");
    element.classList.toggle("scw-sectors", layout.view === "wheel" && layout.shape === "sector");
    if (layout.view === "wheel") {
      style.setProperty("--scw-R", `${layout.R}px`);
      style.setProperty("--scw-Rm", `${layout.Rm}px`);
      style.setProperty("--scw-S", `${layout.S}px`);
      style.setProperty("--scw-hub-r", `${layout.hubR}px`);
      // Half the slice's angle: the arc health gauge spans the slice from -half to +half.
      style.setProperty("--scw-half", `${layout.half.toFixed(2)}deg`);
      // RF-94: a sector's portrait box starts above its outer arc; the badge sits just inside the arc.
      const initiativeTop = layout.shape === "sector" ? layout.Rm - layout.R - layout.portrait.top + 4 : 6;
      style.setProperty("--scw-init-top", `${initiativeTop.toFixed(1)}px`);
    } else {
      style.setProperty("--scw-card-w", `${layout.cardWidth}px`);
      style.setProperty("--scw-card-h", `${layout.cardHeight}px`);
    }
    style.setProperty("--scw-bar-w", `${layout.barWidth}px`);
    // RF-104: the split bar's columns stand just past the portraits, not past the bar.
    style.setProperty("--scw-span", `${Math.ceil(2 * layout.across)}px`);
    style.setProperty("--scw-depth", `${Math.ceil(layout.depth)}px`);
    style.setProperty("--scw-bar-h-expanded", `${BAR_HEIGHT.expanded}px`);
    style.setProperty("--scw-bar-h-expanded-side", `${BAR_HEIGHT.expandedSide}px`);
    style.setProperty("--scw-scale", String(scale));
  }

  /**
   * Everything of a user's look that is not geometry: direction, theme, custom
   * colors (RF-92) and style tweaks (RF-98), health overlay, card names and corners, bar size and tools,
   * the Venaerys strip (RF-82) and the rest opacity.
   * @param {HTMLElement} element
   * @param {object} look  appearance values by setting key (appearanceValues() or the editor's draft)
   * @param {object} state { orientation, theme, expanded } — theme already resolved
   */
  static applyLook(element, look, { orientation, theme, expanded }) {
    for (const value of ORIENTATIONS) element.classList.toggle(`scw-${value}`, orientation === value);
    element.classList.toggle("scw-side", isSideOrientation(orientation));
    element.classList.toggle("is-expanded", Boolean(expanded));
    element.classList.toggle("scw-bar-compact", look.barSize === "compact");
    element.classList.toggle("scw-split", WheelAppearance.isSplit(look));
    element.classList.toggle("scw-show-initiative", Boolean(look.showInitiative));
    // A filled turn button keeps its fill on hover (themes.css).
    element.classList.toggle("scw-btn-filled", look.styleButtons === "filled");
    const data = element.dataset;
    data.scwTheme = theme;
    data.scwHealth = look.hpOverlay;
    data.scwNames = look.trackNames;
    data.scwBar = look.barVisibility ?? "always";
    data.scwFinish = look.styleFinish ?? "theme";
    data.scwActingFx = look.actingEffect ?? "none";
    data.scwTurnFx = look.turnEffect ?? "none";
    data.scwStrip = look.phaseStripPlacement;
    data.scwStripFrame = look.phaseStripFrame;
    data.scwStripNames = look.phaseStripNames === false ? "off" : "on";
    const style = element.style;
    style.setProperty("--scw-bar-h-collapsed", `${WheelAppearance.barThickness(orientation, false, look.barSize)}px`);
    style.setProperty("--scw-strip-size", `${PHASE_STRIP_SIZES[look.phaseStripSize] ?? PHASE_STRIP_SIZES.medium}px`);
    style.setProperty("--scw-health-opacity", String(look.hpOverlayOpacity / 100));
    style.setProperty("--scw-rest-opacity", String(look.restOpacity / 100));
    // RF-112: one intensity and one speed for every effect, the acting ones and the particles alike.
    style.setProperty("--scw-fx-strength", String(PARTICLE_INTENSITIES[look.particleIntensity] ?? PARTICLE_INTENSITIES.normal));
    style.setProperty("--scw-fx-speed", String(PARTICLE_SPEEDS[look.particleSpeed] ?? PARTICLE_SPEEDS.normal));
    for (const property of [...OVERRIDE_PROPERTIES, ...STYLE_PROPERTIES]) style.removeProperty(property);
    const colors = Object.fromEntries(Object.entries(COLOR_SETTINGS).map(([role, key]) => [role, look[key]]));
    for (const [property, value] of Object.entries(colorOverrides(colors))) style.setProperty(property, value);
    const tweaks = Object.fromEntries(Object.entries(STYLE_SETTINGS).map(([tweak, key]) => [tweak, look[key]]));
    for (const [property, value] of Object.entries(styleOverrides(tweaks))) style.setProperty(property, value);
  }

  /**
   * What WheelParticles.update() needs for this look (RF-95). "side" tints
   * them with the acting combatant's disposition, the theme's accent while the
   * turn is hidden from this viewer.
   */
  static particleOptions(look, layout, orientation, model) {
    let color = "";
    if (look.particleColor === "custom") color = look.particleCustomColor;
    else if (look.particleColor === "side" && model?.current && !model.activeHidden) {
      const side = model.current.dispositionKey;
      if (["friendly", "neutral", "hostile", "secret"].includes(side)) color = `var(--scw-${side})`;
    }
    return {
      type: look.particleType,
      amount: INTENSITY_AMOUNTS[look.particleIntensity] ?? "normal",
      speed: look.particleSpeed,
      intensity: look.particleIntensity,
      box: particleBox(layout, orientation, look.particlePlacement),
      color,
    };
  }

  /**
   * RF-100: plays the turn-change effect once (effects.css runs it under
   * `.scw-turn-fx-run`); a new turn before it ends starts it over.
   */
  static playTurnEffect(element) {
    if (!element || (element.dataset.scwTurnFx ?? "none") === "none") return;
    clearTimeout(TURN_FX_TIMERS.get(element));
    element.classList.remove("scw-turn-fx-run");
    void element.offsetWidth;
    element.classList.add("scw-turn-fx-run");
    TURN_FX_TIMERS.set(element, setTimeout(() => element.classList.remove("scw-turn-fx-run"), TURN_FX_MS));
  }

  /**
   * How far the Venaerys strip reaches from the bar's edge (RF-82): its gap,
   * padding and portraits, and the names under them unless the tiles carry them.
   */
  static stripDepth(look) {
    const portrait = PHASE_STRIP_SIZES[look.phaseStripSize] ?? PHASE_STRIP_SIZES.medium;
    const names = look.phaseStripNames !== false && look.phaseStripFrame !== "tiles";
    return portrait + PHASE_STRIP_ROOM.frame + (names ? PHASE_STRIP_ROOM.name : 0);
  }

  /** RF-104: whether the bar is split in two columns beside the portraits. */
  static isSplit(look) {
    return look.barLayout === "split";
  }

  /** How far a split bar's column reaches past the portraits, gap included (one column of buttons). */
  static splitReach() {
    return SPLIT_POD.gap + SPLIT_POD.width;
  }

  /**
   * RF-104: the outer zone of a split bar's column stacks as many buttons as
   * the portraits are deep and opens another row of them outward for the
   * rest; then both columns take the size of the larger, so they frame the
   * portraits evenly. Called after the bar renders: it counts what the
   * template drew.
   */
  static fitPods(element, layout) {
    const cells = Math.max(2, Math.floor(layout.depth / SPLIT_POD.cell));
    for (const zone of element.querySelectorAll(".scw-pod-more")) {
      const items = [...zone.children].flatMap((child) => (child.classList.contains("scw-tools") ? [...child.children] : [child]))
        .filter((child) => !child.classList.contains("scw-bar-rule"));
      zone.style.setProperty("--scw-pod-cells", String(Math.max(1, Math.min(items.length, cells))));
    }
    const pods = [...element.querySelectorAll(".scw-pod")];
    if (!pods.length) return;
    const height = Math.max(...pods.map((pod) => pod.offsetHeight));
    const width = Math.max(...pods.map((pod) => pod.offsetWidth));
    for (const pod of pods) {
      pod.style.setProperty("--scw-pod-h", `${height}px`);
      pod.style.setProperty("--scw-pod-w", `${width}px`);
    }
  }

  /** How deep the bar is, for fitting: the side rail's details column is wider; the compact bar is slimmer. */
  static barThickness(orientation, expanded, barSize = "normal") {
    if (!expanded) return barSize === "compact" ? BAR_HEIGHT.compact : BAR_HEIGHT.collapsed;
    return isSideOrientation(orientation) ? BAR_HEIGHT.expandedSide : BAR_HEIGHT.expanded;
  }
}
