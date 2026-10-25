import { I18N_ROOT } from "../constants/module-constants.js";
import { activeHealthSource, projectionSettings } from "../hooks/register-settings.js";
import { VENAERYS_ID, phasePlanOf } from "../helpers/venaerys-phases.js";
import CombatProjector from "./CombatProjector.js";
import CombatantAdapter from "./CombatantAdapter.js";
import PhaseProjector from "./PhaseProjector.js";

/** v13 moved VideoHelper under foundry.helpers.media; the global is deprecated. */
function isVideo(src) {
  const helper = foundry.helpers?.media?.VideoHelper ?? globalThis.VideoHelper;
  return Boolean(helper?.hasVideoExtension(src));
}

/**
 * The WheelModel of `combat` as the current user may see it: its phases when
 * SC Venaerys's Initiative runs it (RF-80), its turns otherwise.
 */
export function projectCombat(combat) {
  const context = projectionContext();
  if (isVenaerysActive()) {
    const phased = PhaseProjector.project(combat, {
      ...context,
      localize: (key) => game.i18n.localize(key),
      waitingName: game.i18n.localize(`${I18N_ROOT}.Hub.Waiting`),
    });
    if (phased) return phased;
  }
  return CombatProjector.project(combat, context);
}

/**
 * One combatant's view model as the wheel would draw it, whether or not it is
 * on the ring: the dead-turn skip must still read a defeated combatant the
 * "remove" setting keeps off it.
 */
export function projectCombatant(combatant) {
  return CombatantAdapter.toViewModel(combatant, { ...projectionContext(), round: combatant.parent?.round ?? 0 });
}

function projectionContext() {
  return {
    isGM: game.user.isGM,
    settings: projectionSettings(),
    healthSource: activeHealthSource(),
    unknownName: game.i18n.localize(`${I18N_ROOT}.Slice.Unknown`),
    isVideo,
  };
}

/** Phases only count while the module that runs them is on: its flags outlive it. */
export function isVenaerysActive() {
  return Boolean(game.modules.get(VENAERYS_ID)?.active);
}

/** Whether `combat` turns phase by phase on this client. */
export function isPhasedCombat(combat) {
  return isVenaerysActive() && phasePlanOf(combat) !== null;
}
