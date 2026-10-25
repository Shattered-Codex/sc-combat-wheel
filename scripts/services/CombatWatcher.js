import { COMBAT_STYLE_FLAG, MODULE_ID, SETTINGS, TIMING } from "../constants/module-constants.js";
import { getSetting } from "../hooks/register-settings.js";
import { turnChanged } from "../helpers/turn-events.js";
import CombatWheelApp from "../applications/CombatWheelApp.js";
import { phasePositionOf } from "../helpers/venaerys-phases.js";
import { isPhasedCombat, projectCombat } from "./project-combat.js";
import TurnSideEffects from "./TurnSideEffects.js";
import DeadTurnSkipper from "./DeadTurnSkipper.js";
import WidgetPosition from "./WidgetPosition.js";
import VirtualPositions from "./VirtualPositions.js";
import TurnAutomation from "./TurnAutomation.js";

/**
 * Owns the widget's lifecycle: opens it when a combat starts (RF-00), closes it
 * when the combat goes away, and funnels document hooks into batched refreshes
 * (ARCHITECTURE §5). It also reacts to real turn changes (sounds, camera,
 * notices, virtual positions) whether or not the wheel is open.
 */
export default class CombatWatcher {
  #app = null;
  #createApp;
  #onTurnChanged;
  #refreshTimer = null;
  /**
   * Last `{ round, turn }` seen per combat id: catches the 0 → ≥1 start on every
   * client and tells a real turn change (and its direction) from other updates.
   */
  #positions = new Map();

  /**
   * @param {object} [options]  injectable for tests
   * @param {() => CombatWheelApp} [options.createApp]
   * @param {(combat: Combat, previous: {round:number, turn:number}) => void} [options.onTurnChanged]
   */
  constructor({ createApp = () => new CombatWheelApp(), onTurnChanged = CombatWatcher.#reactToTurn } = {}) {
    this.#createApp = createApp;
    this.#onTurnChanged = onTurnChanged;
  }

  /**
   * Default turn reaction: sounds, camera and notice for this user, then virtual
   * positions and the dead-turn skip. Under SC Venaerys's Initiative a GM's
   * `nextTurn()` advances a whole phase, and the module already keeps the
   * pointer off the fallen, so neither automation runs there (RF-80).
   */
  static #reactToTurn(combat, previous) {
    if (combat === game.combat) TurnSideEffects.onTurnChanged(combat, projectCombat(combat), previous);
    if (isPhasedCombat(combat)) return;
    TurnAutomation.noteTurnChange(combat, previous);
    VirtualPositions.onTurnChanged(combat, previous);
    DeadTurnSkipper.onTurnChanged(combat, previous);
  }

  /** The wheel while it is shown or being drawn: a render in progress queues later ones (ApplicationV2). */
  get app() {
    return this.#app?.isOpen ? this.#app : null;
  }

  start() {
    for (const combat of game.combats) this.#positions.set(combat.id, CombatWatcher.#positionOf(combat));

    Hooks.on("createCombat", (combat) => {
      this.#positions.set(combat.id, CombatWatcher.#positionOf(combat));
      VirtualPositions.onCombatCreated(combat);
      this.#onViewedCombatMaybeChanged();
    });
    Hooks.on("deleteCombat", (combat) => {
      this.#positions.delete(combat.id);
      TurnSideEffects.onCombatEnded(combat);
      if (this.#app?.combatId === combat.id) this.close();
      else this.#onViewedCombatMaybeChanged();
    });
    Hooks.on("updateCombat", (combat, changed) => this.#onUpdateCombat(combat, changed));
    Hooks.on("canvasReady", () => this.#onViewedCombatMaybeChanged());

    for (const hook of ["createCombatant", "updateCombatant", "deleteCombatant"]) {
      Hooks.on(hook, (combatant) => {
        if (combatant.parent === game.combat) this.scheduleRefresh();
      });
    }
    for (const hook of ["createCombatant", "deleteCombatant"]) {
      Hooks.on(hook, (combatant) => this.#onRosterChanged(combatant.parent));
    }
    // A new initiative re-sorts the turns and moves the pointer with the acting combatant.
    Hooks.on("updateCombatant", (combatant, changed) => {
      if ("initiative" in changed) this.#onRosterChanged(combatant.parent, { reportHandOver: false });
    });
    Hooks.on("updateCombatant", (combatant, changed) => VirtualPositions.onCombatantUpdated(combatant, changed));
    for (const hook of ["updateActor", "updateActorDelta"]) {
      Hooks.on(hook, (document) => this.#refreshIfActorInCombat(document.actor ?? document));
    }
    Hooks.on("updateToken", (token) => {
      if (game.combat?.combatants.some((c) => c.tokenId === token.id)) this.scheduleRefresh();
    });
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(hook, (effect) => this.#refreshIfActorInCombat(effect.target ?? effect.parent));
    }

    const combat = game.combat;
    if (combat?.started && getSetting(SETTINGS.openOnStart)) this.open({ auto: true });
  }

  /** @param {{auto?: boolean}} [options] auto-opens are skipped when this user sees nobody. */
  open({ auto = false } = {}) {
    const combat = game.combat;
    if (!combat) return;
    this.#app ??= this.#createApp();
    if (auto && !this.#app.hasVisibleCombatants(combat)) return;
    this.#app.render({ force: true });
  }

  close() {
    this.#app?.close();
  }

  toggle() {
    if (this.app) this.close();
    else this.open();
  }

  /** Puts the wheel back in its default place, for when it was dragged out of reach. */
  async resetPosition() {
    await WidgetPosition.reset();
    this.relayout();
  }

  /** Coalesces bursts of hooks into one projection (SPEC §4, 50 ms). */
  scheduleRefresh() {
    if (!this.app) return;
    clearTimeout(this.#refreshTimer);
    this.#refreshTimer = setTimeout(() => this.app?.refreshCombat(), TIMING.refreshBatch);
  }

  /** Settings that change geometry need the wheel part rebuilt. */
  relayout() {
    this.app?.render({ force: true });
  }

  #onUpdateCombat(combat, changed) {
    const previous = this.#positions.get(combat.id) ?? { round: 0, turn: null };
    const current = CombatWatcher.#positionOf(combat);
    this.#positions.set(combat.id, current);
    VirtualPositions.onCombatUpdated(combat, changed);

    if ("active" in changed || "scene" in changed) this.#onViewedCombatMaybeChanged();
    if (turnChanged(previous, current) && !CombatWatcher.#sameHolder(previous, current)) this.#onTurnChanged(combat, previous);
    if (combat !== game.combat) return;

    const justStarted = previous.round === 0 && combat.round >= 1;
    if (justStarted && !this.app && getSetting(SETTINGS.openOnStart)) return this.open({ auto: true });
    // RF-108: another style can change the shape of everything, not just the data.
    if (foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.${COMBAT_STYLE_FLAG}`)) return this.relayout();
    this.scheduleRefresh();
  }

  /**
   * Adding, removing or re-sorting combatants moves the pointer with
   * `updateSource`, so no `updateCombat` follows, and the next real turn
   * change would be read against a stale index. Deleting the acting combatant
   * hands the turn to its successor, often at the same index: that is a turn
   * change, reported as a step forward. Any other shift of the index keeps the
   * same combatant and is only recorded; a new initiative is never reported.
   * The hook fires before Combat rebuilds its turns (v13 dispatches the
   * parent's handlers right after, in the same task), hence the microtask.
   */
  #onRosterChanged(combat, { reportHandOver = true } = {}) {
    if (!combat) return;
    queueMicrotask(() => {
      const previous = this.#positions.get(combat.id);
      const current = CombatWatcher.#positionOf(combat);
      this.#positions.set(combat.id, current);
      // Venaerys keeps its own pointer between phases (RF-80).
      if (!reportHandOver || !previous || !combat.started || isPhasedCombat(combat) || previous.combatantId === current.combatantId) return;
      if (!current.combatantId) return;
      const forward = current.round === previous.round ? { round: current.round, turn: current.turn - 1 } : previous;
      this.#onTurnChanged(combat, forward);
    });
  }

  /**
   * The same combatant in the same round at another index: a re-sort
   * (`resetAll()`, a roll with `updateTurn`), not a turn change. Phases carry
   * no combatant: their position is the phase itself.
   */
  static #sameHolder(previous, current) {
    return previous.round === current.round && current.combatantId !== null && previous.combatantId === current.combatantId;
  }

  /** In a phased combat the "turn" is the phase: a done mark that moves the pointer inside it is no turn change. */
  static #positionOf(combat) {
    const phased = isPhasedCombat(combat) && combat.round > 0;
    const turn = phased ? phasePositionOf(combat) : combat.turn;
    return { round: combat.round ?? 0, turn: turn ?? null, combatantId: phased ? null : combat.combatant?.id ?? null };
  }

  /** The viewed combat depends on the scene and on which encounter is active. */
  #onViewedCombatMaybeChanged() {
    if (!this.app) return;
    if (!game.combat) return this.close();
    if (this.#app.combatId !== game.combat.id) return this.relayout();
    this.scheduleRefresh();
  }

  #refreshIfActorInCombat(actor) {
    if (!actor || !this.app) return;
    if (game.combat?.combatants.some((c) => c.actor === actor || c.actorId === actor.id)) this.scheduleRefresh();
  }
}
