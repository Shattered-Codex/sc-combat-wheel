import { DISPOSITION, I18N_ROOT, MODULE_ID, SETTINGS } from "../constants/module-constants.js";
import { getSetting } from "../hooks/register-settings.js";
import { isForward } from "../helpers/turn-events.js";
import {
  INITIATIVE_SHOWN_FLAG,
  combatantsOfSpeaker,
  rollOrigin,
  rolledInOf,
  withRolledIn,
  forgetShownInitiative,
  forgetShownOnReset,
  isInitiativeHidden,
  isInitiativeRollMessage,
  shouldKeepRollFromPlayers,
  shouldRecordShown,
} from "../helpers/initiative-reveal.js";
import { IDENTITY_REVEALED_FLAG, concealModeOf } from "../helpers/identity-reveal.js";
import { shouldSkipTurn } from "../helpers/visibility-rules.js";
import { virtualFlagOf } from "../helpers/virtual-positions.js";
import { projectCombatant } from "./project-combat.js";
import TurnAutomation from "./TurnAutomation.js";

/**
 * #11: enemies' initiative stays hidden from players until their turn. The
 * active GM records, on the combatant, the number its turn showed; the
 * projection (CombatantAdapter) and the core tracker read it on every client,
 * so a reveal survives reloads and later rounds. Foundry keeps the order and
 * the turns: this only writes the module's own flag.
 */
export default class InitiativeReveal {
  /** Combats with an initiative roll under way on this client, counted (a system's roll calls core's inside it). */
  static #rolling = new Map();
  /** Prototypes already wrapped, so the base class and a system's class are each wrapped once. */
  static #wrapped = new WeakSet();

  /**
   * A real turn change, on every client (CombatWatcher); only the active GM
   * writes. Going back still shows the number (the turn did come up); a dead
   * combatant the module skips on the way forward (RF-46) never had its turn,
   * and one Foundry skips never becomes current at all.
   */
  static onTurnChanged(combat, previous) {
    if (!getSetting(SETTINGS.hideEnemyInitiative) || !TurnAutomation.isActiveGM()) return;
    const combatant = combat.combatant;
    if (!combatant || virtualFlagOf(combatant) || combatant.token?.disposition === DISPOSITION.FRIENDLY) return;
    const forward = isForward(previous, { round: combat.round, turn: combat.turn });
    const skipped = forward && shouldSkipTurn(projectCombatant(combatant), getSetting(SETTINGS.skipDead));
    const shown = combatant.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG);
    if (!shouldRecordShown({ started: combat.started, initiative: combatant.initiative, shown, skipped })) return;
    combatant.setFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG, combatant.initiative)
      .catch((error) => console.error(`${MODULE_ID} | could not record a shown initiative`, error));
  }

  /**
   * The core tracker prints every initiative: on a player's client a hidden
   * one is replaced by "?" after each render (its own and its pop-out's). The
   * row and the value come from Foundry's template, the same in v13 and v14
   * (`li.combatant[data-combatant-id] .token-initiative`).
   */
  static install() {
    // On the client that makes the update (v13 and v14 alike): a new number or a cleared one hides it again.
    Hooks.on("preUpdateCombatant", (combatant, changes) => {
      forgetShownInitiative(changes, combatant.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), combatant.initiative);
    });
    Hooks.on("preUpdateCombat", (combat, changes) => forgetShownOnReset(changes));
    InitiativeReveal.#wrapCombat(foundry.documents.Combat?.prototype, { mark: true });
    Hooks.on("preCreateChatMessage", (message) => InitiativeReveal.#onRollMessage(message));
    Hooks.on("renderCombatTracker", (application, element) => InitiativeReveal.#maskTracker(application, element));
    // The world setting reaches every client: the tracker is drawn again with or without the mask.
    Hooks.on("updateSetting", (setting) => {
      if (setting.key === `${MODULE_ID}.${SETTINGS.hideEnemyInitiative}`) ui.combat?.render();
    });
  }

  /**
   * Once every system has set its combat class (ready): a system that rolls
   * its own way before calling core (PF2e creates its creatures' messages
   * first) gets its class's roll wrapped too.
   */
  static start() {
    const systemClass = globalThis.CONFIG?.Combat?.documentClass;
    if (systemClass && systemClass.prototype !== foundry.documents.Combat?.prototype) {
      InitiativeReveal.#wrapCombat(systemClass.prototype, { mark: false });
    }
  }

  /**
   * Foundry's roll messages do not say which combat they were rolled in, and
   * the viewed one may change while a roll is under way. Core's
   * `Combat#rollInitiative` takes `messageOptions` and merges them into each
   * message (v13 and v14): its wrapper (`mark`) names the combat in them,
   * which covers systems that call `super` first (dnd5e). Every wrapper also
   * notes the combat as rolling, for messages a system creates before calling
   * core (PF2e). Only a class's own method is wrapped, once; nothing else of
   * the roll changes.
   */
  static #wrapCombat(prototype, { mark }) {
    if (!prototype || InitiativeReveal.#wrapped.has(prototype)) return;
    InitiativeReveal.#wrapped.add(prototype);
    const rollInitiative = Object.hasOwn(prototype, "rollInitiative") ? prototype.rollInitiative : null;
    if (typeof rollInitiative !== "function") return;
    prototype.rollInitiative = async function rollInitiativeInItsCombat(ids, options = {}) {
      const own = mark ? { ...options, messageOptions: withRolledIn(options?.messageOptions, this.id) } : options;
      return InitiativeReveal.#during(InitiativeReveal.#rolling, this.id, () => rollInitiative.call(this, ids, own));
    };
  }

  /** Runs `work` with `key` counted in `registry` until it settles. */
  static async #during(registry, key, work) {
    registry.set(key, (registry.get(key) ?? 0) + 1);
    try {
      return await work();
    } finally {
      const left = (registry.get(key) ?? 1) - 1;
      if (left > 0) registry.set(key, left);
      else registry.delete(key);
    }
  }

  /**
   * An initiative roll message, on the roller's client. A public roll for an
   * enemy would print the number (and its name, #14) in the chat for everyone: it goes to the GM
   * only (the roller still sees their own message); while its combat is not
   * known, every encounter the token is in counts — players are shown less,
   * never more. A reroll that came out the same number changed nothing
   * Foundry reports, so the message is what says the number is new: it hides
   * again, but only in the combat the message is known to come from
   * (rollOrigin). A message that does not say (a system rolling outside
   * `Combat#rollInitiative`, PF2e from a sheet or a hero-point reroll) hides
   * again only through a new number, never by a guess: a repeated number is
   * one players already know.
   */
  static #onRollMessage(message) {
    if (!isInitiativeRollMessage(message.flags)) return;
    const found = new Map();
    for (const combat of game.combats) {
      const combatants = InitiativeReveal.#speakerIn(combat, message.speaker);
      if (combatants.length) found.set(combat.id, combatants);
    }
    const origin = rollOrigin({
      rolledIn: rolledInOf(message.flags),
      rolling: [...InitiativeReveal.#rolling.keys()],
      candidates: [...found.keys()],
    });
    const rolledHere = origin.flatMap((id) => found.get(id) ?? []);
    const rolled = rolledHere.length ? rolledHere : [...found.values()].flat();
    for (const combatant of rolledHere) {
      if (combatant.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG) === undefined || combatant.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG) === null) continue;
      combatant.setFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG, null)
        .catch((error) => console.error(`${MODULE_ID} | could not hide a rerolled initiative`, error));
    }
    const keep = shouldKeepRollFromPlayers({
      hideEnemyInitiative: getSetting(SETTINGS.hideEnemyInitiative),
      concealEnemyIdentity: concealModeOf(getSetting(SETTINGS.concealEnemyIdentity)) !== "off",
      whisper: message.whisper,
      rolled: rolled.map((combatant) => ({
        disposition: combatant.token?.disposition ?? DISPOSITION.NEUTRAL,
        virtual: virtualFlagOf(combatant) !== null,
        revealed: Boolean(combatant.getFlag(MODULE_ID, IDENTITY_REVEALED_FLAG)),
      })),
    });
    if (keep) InitiativeReveal.#toGameMasters(message);
  }

  /** The combatants of `combat` a roll message speaks for, found by the scene their token is really on. */
  static #speakerIn(combat, speaker) {
    return combat.combatants.contents.filter((combatant) => InitiativeReveal.#speaksFor(speaker, combatant));
  }

  static #speaksFor(speaker, combatant) {
    const combat = combatant.parent ?? null;
    return combatantsOfSpeaker(speaker, [{
      tokenId: combatant.tokenId,
      // Foundry resolves an empty sceneId through the combat's scene.
      sceneId: combatant.token?.parent?.id ?? combatant.sceneId ?? combat?.scene?.id ?? null,
      actorId: combatant.actorId,
    }]).length > 0;
  }

  /** v14 names message visibility modes ("gm"); v13 only has roll modes ("gmroll"). */
  static #toGameMasters(message) {
    if (typeof message.applyMode === "function") message.applyMode("gm");
    else message.applyRollMode(CONST.DICE_ROLL_MODES.PRIVATE);
  }

  static #maskTracker(application, element) {
    if (game.user.isGM || !getSetting(SETTINGS.hideEnemyInitiative)) return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const combat = application?.viewed ?? game.combat;
    if (!root || !combat) return;
    for (const row of root.querySelectorAll("li.combatant[data-combatant-id]")) {
      const combatant = combat.combatants.get(row.dataset.combatantId);
      const cell = row.querySelector(".token-initiative");
      if (!combatant || !cell || !InitiativeReveal.isHiddenFromUser(combatant)) continue;
      const mark = document.createElement("span");
      mark.className = "scw-initiative-hidden";
      mark.textContent = "?";
      mark.setAttribute("aria-label", game.i18n.localize(`${I18N_ROOT}.Slice.InitiativeHidden`));
      cell.replaceChildren(mark);
    }
  }

  /** Whether this user may not see the combatant's initiative yet. */
  static isHiddenFromUser(combatant) {
    return isInitiativeHidden(
      {
        initiative: Number.isFinite(combatant.initiative) ? combatant.initiative : null,
        shown: combatant.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG),
        disposition: combatant.token?.disposition ?? DISPOSITION.NEUTRAL,
        isOwner: Boolean(combatant.isOwner),
        virtual: virtualFlagOf(combatant) !== null,
      },
      { isGM: game.user.isGM, hideEnemyInitiative: getSetting(SETTINGS.hideEnemyInitiative) },
    );
  }
}
