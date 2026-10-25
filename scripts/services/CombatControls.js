import { I18N_ROOT } from "../constants/module-constants.js";
import { VENAERYS_ID } from "../helpers/venaerys-phases.js";

/**
 * Every change to the combat goes through Foundry's Combat API, after the same
 * permission check the widget used to show the control (ARCHITECTURE §6).
 */
export default class CombatControls {
  static nextTurn(combat) {
    if (!CombatControls.#requireGM(combat)) return null;
    return combat.nextTurn();
  }

  static previousTurn(combat) {
    if (!CombatControls.#requireGM(combat)) return null;
    return combat.previousTurn();
  }

  /** Core asks for confirmation before deleting the encounter. */
  static endCombat(combat) {
    if (!CombatControls.#requireGM(combat)) return null;
    return combat.endCombat();
  }

  /**
   * The model may predate a turn change the wheel has not drawn yet: the
   * acting combatant must still be the user's when the button is pressed.
   * Under Venaerys the button marks the user's own combatants done, which
   * Venaerys checks itself.
   */
  static endOwnTurn(combat, model) {
    if (!combat || !model?.canEndOwnTurn) return CombatControls.#deny();
    if (!model.phased && !combat.combatant?.isOwner) return CombatControls.#deny();
    return combat.nextTurn();
  }

  /** Whether SC Venaerys's Initiative takes done marks from other modules (its API has them since they were added for the strip). */
  static canMarkMembers() {
    return typeof game.modules.get(VENAERYS_ID)?.api?.setDone === "function";
  }

  /**
   * Marks or unmarks one member of the current phase as finished (in the
   * movement half, as moved) through Venaerys, which checks who may.
   */
  static toggleMemberDone(combat, combatantId, model) {
    const member = model?.phase?.acting.find((vm) => vm.id === combatantId);
    const api = game.modules.get(VENAERYS_ID)?.api;
    if (!combat || !member?.isOwner || !CombatControls.canMarkMembers()) return CombatControls.#deny();
    const finished = member.status !== "done";
    if (model.phase.half === "move") return api.setMoved(combat, combatantId, finished);
    return api.setDone(combat, combatantId, finished);
  }

  /** RF-14: the GM roll menu. Only combatants without initiative are rolled (D-13). */
  static roll(combat, group, model) {
    if (!CombatControls.#requireGM(combat)) return null;
    switch (group) {
      case "all":
        return combat.rollAll();
      case "npc":
        return combat.rollNPC();
      case "pc": {
        const ids = CombatControls.#pending(model).filter((vm) => vm.hasPlayerOwner).map((vm) => vm.id);
        return ids.length ? combat.rollInitiative(ids) : null;
      }
      case "reset":
        return combat.resetAll();
      default:
        return null;
    }
  }

  /** RF-15: the GM rolls every pending combatant, a player only their own. */
  static rollPending(combat, model) {
    if (!combat || !model?.pendingOwnIds.length) return null;
    if (game.user.isGM) return combat.rollAll();
    return combat.rollInitiative(model.pendingOwnIds);
  }

  static rollOne(combat, combatantId) {
    const combatant = combat?.combatants.get(combatantId);
    if (!combatant?.isOwner || combatant.initiative !== null) return null;
    return combat.rollInitiative([combatantId]);
  }

  /** How many combatants each menu entry affects. */
  static rollCounts(model) {
    const pending = CombatControls.#pending(model);
    return {
      all: pending.length,
      npc: pending.filter((vm) => !vm.hasPlayerOwner).length,
      pc: pending.filter((vm) => vm.hasPlayerOwner).length,
      reset: model?.rolledCount ?? 0,
    };
  }

  static #pending(model) {
    return (model?.ring ?? []).filter((vm) => !vm.hasInitiative && !vm.virtual);
  }

  static #requireGM(combat) {
    if (combat && game.user.isGM) return true;
    CombatControls.#deny();
    return false;
  }

  static #deny() {
    ui.notifications.warn(`${I18N_ROOT}.Notifications.NotAllowed`, { localize: true });
    return null;
  }
}
