import { SETTINGS, VIRTUAL_TURN_HOOK } from "../constants/module-constants.js";
import { getSetting, setSetting } from "../hooks/register-settings.js";
import { isForward } from "../helpers/turn-events.js";
import ConsequenceRunner from "./ConsequenceRunner.js";
import TurnAutomation from "./TurnAutomation.js";
import {
  combatantDataFor,
  configFor,
  normalizeTemplate,
  virtualFlagOf,
} from "../helpers/virtual-positions.js";

/** Pause before auto-advancing, so the wheel shows the virtual position first. */
const AUTO_ADVANCE_DELAY = 800;

/**
 * Virtual positions (RF-60 to RF-68): initiative slots that are not creatures
 * and run consequences (message, sound, hook, macro, table, other SC modules)
 * when their turn comes. They are ordinary Combatants carrying a flag, so
 * Foundry keeps owning the turn order.
 */
export default class VirtualPositions {
  static templates() {
    return (getSetting(SETTINGS.virtualTemplates) ?? []).map(normalizeTemplate);
  }

  static saveTemplates(templates) {
    return setSetting(SETTINGS.virtualTemplates, templates.map(normalizeTemplate));
  }

  static isVirtual(combatant) {
    return virtualFlagOf(combatant) !== null;
  }

  /** RF-62. GM only. */
  static async addToCombat(combat, templateId) {
    const template = VirtualPositions.templates().find((t) => t.id === templateId);
    if (!combat || !template || !game.user.isGM) return null;
    const [combatant] = await combat.createEmbeddedDocuments("Combatant", [combatantDataFor(template)]);
    return combatant;
  }

  /**
   * RF-69: a position created on the spot from the overview, at an exact
   * initiative. From a template when one is picked, otherwise a titled screen
   * message; a picture chosen there replaces the template's. GM only.
   */
  static async addAt(combat, { initiative, name, text, img, templateId }) {
    if (!combat || !game.user.isGM) return null;
    const template = VirtualPositions.templates().find((t) => t.id === templateId);
    const data = template
      ? combatantDataFor({ ...template, name: name || template.name, img: img || template.img, initiative })
      : combatantDataFor({
          name,
          img,
          initiative,
          consequences: [{ kind: "screenMessage", params: { title: name, text } }],
        });
    const [combatant] = await combat.createEmbeddedDocuments("Combatant", [data]);
    return combatant;
  }

  /** RF-62: templates marked "every new combat" join as soon as the combat exists. */
  static async onCombatCreated(combat) {
    if (!TurnAutomation.isActiveGM()) return;
    const data = VirtualPositions.templates()
      .filter((t) => t.autoAdd)
      .map(combatantDataFor);
    if (data.length) await combat.createEmbeddedDocuments("Combatant", data);
  }

  /** RF-66: a reset of one combatant wiped the fixed initiative; put it back. */
  static onCombatantUpdated(combatant, changed) {
    if (!("initiative" in changed) || !TurnAutomation.isActiveGM()) return;
    const update = VirtualPositions.#restoredInitiative(combatant, VirtualPositions.templates());
    if (update) combatant.update({ initiative: update.initiative });
  }

  /**
   * RF-66: `resetAll()` rewrites every combatant through one Combat update
   * (`changed.combatants`, `diff: false`), which fires no `updateCombatant`;
   * the fixed initiatives are put back in one batch.
   */
  static onCombatUpdated(combat, changed) {
    if (!("combatants" in changed) || !TurnAutomation.isActiveGM()) return;
    const templates = VirtualPositions.templates();
    const updates = combat.combatants.map((c) => VirtualPositions.#restoredInitiative(c, templates)).filter(Boolean);
    if (updates.length) combat.updateEmbeddedDocuments("Combatant", updates);
  }

  static #restoredInitiative(combatant, templates) {
    const flag = virtualFlagOf(combatant);
    if (!flag || combatant.initiative !== null) return null;
    return { _id: combatant.id, initiative: configFor(flag, templates).initiative };
  }

  /**
   * RF-63 to RF-65, on every client that saw the turn move forward.
   * @param {Combat} combat
   * @param {{round:number, turn:number}} previous  position before the change
   */
  static async onTurnChanged(combat, previous) {
    const current = { round: combat.round, turn: combat.turn };
    if (!combat.started || !isForward(previous, current)) return;
    const combatant = combat.combatant;
    const flag = virtualFlagOf(combatant);
    if (!flag) return;

    const entry = TurnAutomation.turnSerial(combat);
    const config = configFor(flag, VirtualPositions.templates());
    const payload = { combat, combatant, config };
    const visible = !combatant.hidden || game.user.isGM;
    if (visible) Hooks.callAll(VIRTUAL_TURN_HOOK, payload);
    await ConsequenceRunner.run(config, payload, { visible });

    // A slow macro may finish after the combat moved on, or left and came back: that turn's own automation stands.
    if (TurnAutomation.turnSerial(combat) !== entry) return;
    if (!TurnAutomation.isActiveGM()) return;
    if (config.autoAdvance) TurnAutomation.advance(combat, combatant.id, AUTO_ADVANCE_DELAY);
    else TurnAutomation.settle(combat);
  }
}
