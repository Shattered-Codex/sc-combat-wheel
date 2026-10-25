import { SETTINGS } from "../constants/module-constants.js";
import { getSetting } from "../hooks/register-settings.js";
import { isForward } from "../helpers/turn-events.js";
import { shouldSkipTurn } from "../helpers/visibility-rules.js";
import { virtualFlagOf } from "../helpers/virtual-positions.js";
import { projectCombatant } from "./project-combat.js";
import TurnAutomation from "./TurnAutomation.js";

/** Short pause so the wheel shows who was skipped. */
const SKIP_DELAY = 350;

/**
 * RF-46: when the turn moves forward onto a dead combatant, the active GM skips
 * it according to the world setting. Going back never skips, so the GM can
 * always return to a fallen combatant on purpose.
 */
export default class DeadTurnSkipper {
  static onTurnChanged(combat, previous) {
    if (!TurnAutomation.isActiveGM() || !combat.started) return;
    if (!isForward(previous, { round: combat.round, turn: combat.turn })) return;
    const combatant = combat.combatant;
    if (!combatant || virtualFlagOf(combatant)) return;

    if (shouldSkipTurn(projectCombatant(combatant), getSetting(SETTINGS.skipDead))) TurnAutomation.advance(combat, combatant.id, SKIP_DELAY);
    else TurnAutomation.settle(combat);
  }
}
