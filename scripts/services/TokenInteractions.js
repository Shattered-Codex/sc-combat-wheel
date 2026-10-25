import { SETTINGS } from "../constants/module-constants.js";
import { panDuration } from "../helpers/camera-pan.js";
import { getSetting } from "../hooks/register-settings.js";

/**
 * Slice ↔ canvas interactions (RF-30, RF-31). Only tokens placed on the scene
 * currently viewed are touched.
 */
export default class TokenInteractions {
  static #highlighted = null;

  static placeableFor(combat, combatantId) {
    const combatant = combat?.combatants.get(combatantId);
    if (!combatant || combatant.sceneId !== canvas.scene?.id) return null;
    return combatant.token?.object ?? null;
  }

  static click(combat, combatantId, action) {
    const combatant = combat?.combatants.get(combatantId);
    if (!combatant || action === "none") return;
    if (action === "sheet") {
      if (combatant.actor?.testUserPermission(game.user, "LIMITED")) combatant.actor.sheet.render(true);
      return;
    }
    const token = TokenInteractions.placeableFor(combat, combatantId);
    if (!token) return;
    if (action === "select" && token.isOwner) token.control({ releaseOthers: true });
    TokenInteractions.pan(token);
  }

  /** RF-109: glides there at the user's pace (longer the farther it is); straight there under reduced motion. */
  static pan(token) {
    if (!TokenInteractions.#isVisible(token)) return;
    const { x, y } = token.center;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return canvas.pan({ x, y });
    const from = canvas.stage.pivot;
    const distance = Math.hypot(x - from.x, y - from.y);
    return canvas.animatePan({ x, y, duration: panDuration(distance, getSetting(SETTINGS.cameraPan)) });
  }

  static panToCombatant(combat, combatantId) {
    const token = TokenInteractions.placeableFor(combat, combatantId);
    if (token) TokenInteractions.pan(token);
  }

  /** Mirrors the core tracker's hover: highlight without stealing control. */
  static hoverIn(combat, combatantId, event) {
    const token = TokenInteractions.placeableFor(combat, combatantId);
    if (!token || !TokenInteractions.#isVisible(token)) return;
    if (!token.controlled) token._onHoverIn(event, { hoverOutOthers: true });
    TokenInteractions.#highlighted = token;
  }

  static hoverOut(event) {
    TokenInteractions.#highlighted?._onHoverOut(event);
    TokenInteractions.#highlighted = null;
  }

  static #isVisible(token) {
    return token.isVisible ?? token.visible;
  }
}
