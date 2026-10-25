import { BAR_HEIGHT, SETTINGS } from "../constants/module-constants.js";
import { getSetting, setSetting } from "../hooks/register-settings.js";
import { isSideOrientation } from "../helpers/orientation.js";

/** Leaves room for the core hotbar under the default bottom-centre position. */
const HOTBAR_CLEARANCE = 96;
/** Default side positions keep clear of the scene controls (left) and the sidebar (right). */
const CONTROLS_CLEARANCE = 72;
const SIDEBAR_CLEARANCE = 320;
const EDGE_MARGIN = 8;

/**
 * Where the wheel's anchor (the middle of the bar's arc-side edge) sits on screen.
 * Stored as a fraction of the viewport so it survives resolution changes (SPEC §7).
 */
export default class WidgetPosition {
  static state() {
    return { position: null, locked: false, expanded: false, ...getSetting(SETTINGS.widgetState) };
  }

  static save(patch) {
    return setSetting(SETTINGS.widgetState, { ...WidgetPosition.state(), ...patch });
  }

  /** Forgets where the wheel was dragged, so it opens in its default place again (lock and details stay). */
  static reset() {
    return WidgetPosition.save({ position: null });
  }

  /**
   * Anchor in pixels, clamped so the bar stays on screen. `barThickness` is how
   * far the bar reaches past the anchor, away from the portraits (none for a
   * split or hidden bar); `trayDepth` is what reaches past it (the Venaerys
   * phase strip).
   */
  static anchor({ orientation, barWidth, barThickness = BAR_HEIGHT.collapsed, trayDepth = 0 }) {
    const { position } = WidgetPosition.state();
    const point = position
      ? { x: position.x * window.innerWidth, y: position.y * window.innerHeight }
      : WidgetPosition.#fallback(orientation, barThickness + trayDepth);
    return WidgetPosition.clamp(point, { orientation, barWidth, barThickness, trayDepth });
  }

  /** Where the wheel opens before it was ever dragged: against the screen edge behind the bar. */
  static #fallback(orientation, bar) {
    const { innerWidth: width, innerHeight: height } = window;
    switch (orientation) {
      case "down":
        return { x: width / 2, y: bar + EDGE_MARGIN };
      case "right":
        return { x: bar + CONTROLS_CLEARANCE, y: height / 2 };
      case "left":
        return { x: width - bar - SIDEBAR_CLEARANCE, y: height / 2 };
      default:
        return { x: width / 2, y: height - bar - HOTBAR_CLEARANCE };
    }
  }

  /** Keeps the whole bar on screen; it lies across the anchor and on the side away from the arc. */
  static clamp({ x, y }, { orientation, barWidth, barThickness = BAR_HEIGHT.collapsed, trayDepth = 0 }) {
    const { innerWidth: width, innerHeight: height } = window;
    const bar = barThickness + trayDepth;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    if (isSideOrientation(orientation)) {
      const halfBar = Math.min(barWidth / 2, height / 2);
      const right = orientation === "right";
      return {
        x: clamp(x, right ? bar + EDGE_MARGIN : EDGE_MARGIN, right ? width - EDGE_MARGIN : width - bar - EDGE_MARGIN),
        y: clamp(y, halfBar, height - halfBar),
      };
    }
    const halfBar = Math.min(barWidth / 2, width / 2);
    const up = orientation === "up";
    return {
      x: clamp(x, halfBar, width - halfBar),
      y: clamp(y, up ? EDGE_MARGIN : bar + EDGE_MARGIN, up ? height - bar - EDGE_MARGIN : height - EDGE_MARGIN),
    };
  }

  static apply(element, { x, y }) {
    element.style.left = `${Math.round(x)}px`;
    element.style.top = `${Math.round(y)}px`;
  }

  /**
   * Drags the widget by `handle`. The element moves live; the setting is
   * written once, on release.
   */
  static attachDrag(handle, element, { orientation, barWidth, barThickness = BAR_HEIGHT.collapsed, trayDepth = () => 0, isLocked }) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || isLocked()) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY };
      const origin = { x: parseFloat(element.style.left) || 0, y: parseFloat(element.style.top) || 0 };
      let last = origin;

      const onMove = (move) => {
        last = WidgetPosition.clamp(
          { x: origin.x + move.clientX - start.x, y: origin.y + move.clientY - start.y },
          { orientation, barWidth, barThickness, trayDepth: trayDepth() },
        );
        WidgetPosition.apply(element, last);
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        if (last === origin) return;
        WidgetPosition.save({ position: { x: last.x / window.innerWidth, y: last.y / window.innerHeight } });
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }
}
