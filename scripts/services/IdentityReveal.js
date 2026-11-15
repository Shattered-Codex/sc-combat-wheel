import { DISPOSITION, I18N_ROOT, MODULE_ID, SETTINGS } from "../constants/module-constants.js";
import { getSetting, setSetting } from "../hooks/register-settings.js";
import { isForward } from "../helpers/turn-events.js";
import { CONCEAL_MODES, IDENTITY_REVEALED_FLAG, UNKNOWN_PORTRAIT, concealModeOf, revealSkipRule, shouldRecordRevealed, viewModelsById } from "../helpers/identity-reveal.js";
import { currentPhaseIdOf, venaerysFlags } from "../helpers/venaerys-phases.js";
import { shouldSkipTurn } from "../helpers/visibility-rules.js";
import { virtualFlagOf } from "../helpers/virtual-positions.js";
import { isPhasedCombat, projectCombat, projectCombatant } from "./project-combat.js";
import TurnAutomation from "./TurnAutomation.js";

/** Pointer and click events the core tracker listens to on its whole element (v13 and v14): a concealed row keeps them. */
const TRACKER_EVENTS = Object.freeze(["click", "dblclick", "pointerover", "pointerout"]);

/**
 * #14: enemies stay unidentified for players until their first turn. The
 * active GM records, on the combatant, that its turn revealed it; the
 * projection (CombatantAdapter) reads it on every client, so a reveal
 * survives reloads and later rounds. Foundry keeps the order and the turns:
 * this only writes the module's own flag.
 */
export default class IdentityReveal {
  /** Combatants whose flag is on its way: hooks fired before it comes back write it once. */
  static #pending = new Set();

  /**
   * A real turn change, on every client (CombatWatcher); only the active GM
   * writes. Going back reveals (the turn did come up); a dead combatant the
   * module skips on the way forward (RF-46) never had its turn, and one
   * Foundry skips never becomes current at all. Under SC Venaerys's
   * Initiative everyone in the phase that acts is revealed, the fallen apart.
   */
  static onTurnChanged(combat, previous) {
    const forward = isForward(previous, { round: combat.round, turn: combat.turn });
    IdentityReveal.#recordActing(combat, { forward });
  }

  /**
   * Players see whoever acts as soon as nothing hides it any more: a hidden
   * combatant or token shown, a status that concealed it lifted, a side
   * turned hostile, the option itself turned on — all in the middle of its turn. The reveal is recorded
   * then too, or the next turn would make it unknown again. Judged as every
   * player's projection judges it (the direction of the turn is not known).
   */
  static #onVisibilityChanged(isConcerned) {
    if (IdentityReveal.mode() === "off" || !TurnAutomation.isActiveGM()) return;
    // After the hook, once the document and its actor's statuses are up to date.
    queueMicrotask(() => {
      for (const combat of game.combats) {
        if (combat.started) IdentityReveal.#recordActing(combat, { forward: null, isConcerned });
      }
    });
  }

  static #recordActing(combat, { forward, isConcerned = () => true }) {
    if (IdentityReveal.mode() === "off" || !TurnAutomation.isActiveGM() || !combat.started) return;
    const phased = isPhasedCombat(combat);
    const skipRule = revealSkipRule({ phased, forward, skipDead: getSetting(SETTINGS.skipDead) });
    for (const combatant of IdentityReveal.#acting(combat, phased)) {
      if (isConcerned(combatant)) IdentityReveal.#record(combatant, combat, skipRule);
    }
  }

  static #record(combatant, combat, skipRule) {
    if (virtualFlagOf(combatant) || combatant.token?.disposition === DISPOSITION.FRIENDLY) return;
    if (IdentityReveal.#pending.has(combatant.uuid)) return;
    const vm = projectCombatant(combatant);
    const revealed = Boolean(combatant.getFlag(MODULE_ID, IDENTITY_REVEALED_FLAG));
    const skipped = shouldSkipTurn(vm, skipRule);
    if (!shouldRecordRevealed({ started: combat.started, revealed, concealed: vm.concealed, skipped })) return;
    IdentityReveal.#pending.add(combatant.uuid);
    combatant.setFlag(MODULE_ID, IDENTITY_REVEALED_FLAG, true)
      .catch((error) => console.error(`${MODULE_ID} | could not record a revealed identity`, error))
      .finally(() => IdentityReveal.#pending.delete(combatant.uuid));
  }

  static #acting(combat, phased) {
    if (!phased) return combat.combatant ? [combat.combatant] : [];
    const phaseId = currentPhaseIdOf(combat);
    if (!phaseId) return [];
    return combat.combatants.contents.filter((combatant) => venaerysFlags(combatant).phase === phaseId);
  }

  /** The world's concealment mode (CONCEAL_MODES). */
  static mode() {
    return concealModeOf(getSetting(SETTINGS.concealEnemyIdentity));
  }

  /**
   * The first builds stored a yes/no: the active GM rewrites it as the mode
   * it meant, so the settings screen shows it (a yes is the placeholder).
   */
  static start() {
    if (!TurnAutomation.isActiveGM()) return;
    const stored = getSetting(SETTINGS.concealEnemyIdentity);
    if (CONCEAL_MODES.includes(stored)) return;
    setSetting(SETTINGS.concealEnemyIdentity, concealModeOf(stored))
      .catch((error) => console.error(`${MODULE_ID} | could not migrate the enemy concealment setting`, error));
  }

  /**
   * The core tracker names and pictures every combatant a player may see: on
   * a player's client a concealed one is masked after each render (its own
   * and its pop-out's), and its row stops panning to, pinging or
   * highlighting the token, which would point it out on the canvas. The row
   * and its parts come from Foundry's template, the same in v13 and v14.
   */
  static install() {
    Hooks.on("updateCombatant", (combatant, changes) => {
      if ("hidden" in changes) IdentityReveal.#onVisibilityChanged((acting) => acting === combatant);
    });
    Hooks.on("updateToken", (token, changes) => {
      if ("hidden" in changes || "disposition" in changes) IdentityReveal.#onVisibilityChanged((acting) => acting.tokenId === token.id);
    });
    // The "invisible" status may conceal a combatant (RF-45).
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(hook, (effect) => {
        const actor = effect.target ?? effect.parent;
        if (actor) IdentityReveal.#onVisibilityChanged((acting) => acting.actor === actor);
      });
    }
    Hooks.on("renderCombatTracker", (application, element) => IdentityReveal.#maskTracker(application, element));
    // The world setting reaches every client: the tracker is drawn again with or without the mask, and
    // whoever acts right now stays revealed (players see them: the next turn must not hide them again).
    Hooks.on("updateSetting", (setting) => {
      if (setting.key !== `${MODULE_ID}.${SETTINGS.concealEnemyIdentity}`) return;
      ui.combat?.render();
      IdentityReveal.#onVisibilityChanged(() => true);
    });
  }

  static #maskTracker(application, element) {
    const mode = IdentityReveal.mode();
    if (game.user.isGM || mode === "off") return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const combat = application?.viewed ?? game.combat;
    if (!root || !combat) return;
    // The wheel's own projection decides, so both always agree (acting, phases, the skip rule). The
    // tracker also lists some the wheel leaves out (a hidden token, the defeated it removes): their own view decides.
    const drawn = viewModelsById(projectCombat(combat));
    const unknown = game.i18n.localize(`${I18N_ROOT}.Slice.Unknown`);
    for (const row of root.querySelectorAll("li.combatant[data-combatant-id]")) {
      const combatant = combat.combatants.get(row.dataset.combatantId);
      if (!combatant) continue;
      const vm = drawn.get(combatant.id) ?? projectCombatant(combatant);
      if (!vm.identityHidden) continue;
      // Left out of the wheel, left out of the tracker: its row would give the count and the order away.
      if (mode === "omit") row.remove();
      else IdentityReveal.#maskRow(row, unknown);
    }
  }

  static #maskRow(row, unknown) {
    const image = row.querySelector("img.token-image");
    if (image) {
      image.src = UNKNOWN_PORTRAIT;
      image.alt = unknown;
    }
    const name = row.querySelector(".token-name .name");
    if (name) name.textContent = unknown;
    const effects = row.querySelector(".token-effects");
    effects?.replaceChildren();
    effects?.removeAttribute("data-tooltip-html");
    row.querySelector(".token-resource")?.remove();
    for (const control of row.querySelectorAll("[data-action='pingCombatant'], [data-action='panToCombatant']")) control.remove();
    row.removeAttribute("data-action");
    // The rows are drawn anew on each render, so these never pile up.
    for (const type of TRACKER_EVENTS) row.addEventListener(type, IdentityReveal.#keepInRow, { capture: true });
  }

  static #keepInRow(event) {
    event.stopPropagation();
  }
}
