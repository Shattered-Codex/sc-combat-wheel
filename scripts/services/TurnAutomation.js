import { I18N_ROOT } from "../constants/module-constants.js";
import { isForward } from "../helpers/turn-events.js";
import { canAutoAdvance } from "../helpers/virtual-positions.js";

/**
 * Advances the turn on the GM's behalf: after a virtual position (RF-65) or
 * past a dead combatant (RF-46). One guard for both, so a combat made only of
 * positions to skip stops after one lap instead of spinning forever.
 */
export default class TurnAutomation {
  /** Consecutive automatic advances per combat; any turn that stays resets it. */
  static #chains = new Map();
  /** The one advance waiting per combat: a newer one replaces it. */
  static #pending = new Map();
  /** Counts the turn changes seen per combat: each entry into a turn has its own number. */
  static #serials = new Map();

  /**
   * Every real turn change, before anything reacts to it. Going back is the
   * GM's own move: it ends the chain and drops a waiting advance.
   */
  static noteTurnChange(combat, previous) {
    TurnAutomation.#serials.set(combat.id, TurnAutomation.turnSerial(combat) + 1);
    if (!isForward(previous, { round: combat.round, turn: combat.turn })) TurnAutomation.settle(combat);
  }

  /** The number of the turn now running; a later turn change, even back to the same combatant, gives another. */
  static turnSerial(combat) {
    return TurnAutomation.#serials.get(combat.id) ?? 0;
  }

  /** A turn that is not skipped ends the chain, and drops an advance still waiting from an earlier turn. */
  static settle(combat) {
    TurnAutomation.#chains.delete(combat.id);
    clearTimeout(TurnAutomation.#pending.get(combat.id));
    TurnAutomation.#pending.delete(combat.id);
  }

  /**
   * Moves to the next turn after `delay` ms, if the turn is still on
   * `combatantId` in the same round and no turn change came between. Going
   * back onto the same combatant (a virtual position, say) is a move the GM
   * made: it stays. Only an advance that happens counts towards the chain.
   * @returns {boolean} whether an advance was scheduled
   */
  static advance(combat, combatantId, delay) {
    const chain = TurnAutomation.#chains.get(combat.id) ?? 0;
    if (!canAutoAdvance(chain, combat.turns.length)) {
      TurnAutomation.#chains.delete(combat.id);
      ui.notifications.warn(`${I18N_ROOT}.Notifications.AutoAdvanceLoop`, { localize: true });
      return false;
    }
    clearTimeout(TurnAutomation.#pending.get(combat.id));
    const round = combat.round;
    const serial = TurnAutomation.turnSerial(combat);
    const timer = setTimeout(() => {
      TurnAutomation.#pending.delete(combat.id);
      // Someone may have moved the turn meanwhile; only advance from this position.
      const live = game.combats.get(combat.id);
      if (live?.combatant?.id !== combatantId || live.round !== round || TurnAutomation.turnSerial(live) !== serial) return;
      TurnAutomation.#chains.set(combat.id, chain + 1);
      live.nextTurn();
    }, delay);
    TurnAutomation.#pending.set(combat.id, timer);
    return true;
  }

  /** Exactly one client runs automation and writes: the active GM. */
  static isActiveGM() {
    return Boolean(game.user.isGM && (game.users.activeGM?.isSelf ?? true));
  }
}
