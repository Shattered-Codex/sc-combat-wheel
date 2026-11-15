import { DISPOSITION, MODULE_ID } from "../constants/module-constants.js";

/**
 * #11: the flag (`flags.sc-combat-wheel.initiativeShown`) holding the
 * initiative players were shown, set by the active GM when the combatant's
 * turn comes up. A new or cleared number clears it in the same update
 * (forgetShownInitiative), a reset through the combat's update
 * (forgetShownOnReset), and a reroll that lands on the same number through its
 * roll message when that message's combat is known (InitiativeReveal).
 * Holding the value, not a yes/no, also covers a number changed without going
 * through any of them.
 */
export const INITIATIVE_SHOWN_FLAG = "initiativeShown";

/** The flag an initiative roll message carries naming the combat it was rolled in (`flags.sc-combat-wheel.rolledIn`). */
export const ROLLED_IN_FLAG = "rolledIn";

/**
 * Whether this viewer must not see the combatant's initiative yet: the world
 * hides enemies' initiative, the viewer is a player who does not own it, it is
 * not friendly (the same line as the exact hit points, RF-42), it is no
 * virtual position (whose initiative is the GM's fixed setting), and the
 * number it has is not the one shown on its turn.
 */
export function isInitiativeHidden({ initiative, shown, disposition, isOwner, virtual }, { isGM, hideEnemyInitiative }) {
  if (!hideEnemyInitiative || isGM || isOwner || virtual) return false;
  if (disposition === DISPOSITION.FRIENDLY) return false;
  if (!Number.isFinite(initiative)) return false;
  return shown !== initiative;
}

/**
 * Whether the active GM should record the acting combatant's initiative as
 * shown: the combat has started, it is someone's turn, the number is not the
 * one already recorded, and the turn is not one the module skips at once
 * (a dead combatant passed over on the way forward never had its turn).
 */
export function shouldRecordShown({ started, initiative, shown, skipped }) {
  return Boolean(started) && !skipped && Number.isFinite(initiative) && shown !== initiative;
}

/** What the wheel prints for a view model's initiative: "?" while it is hidden (#11), `none` before a roll. */
export function initiativeLabel(vm, none = "—") {
  if (vm?.initiativeHidden) return "?";
  return vm?.initiative ?? none;
}

/** An initiative as Foundry stores it: a number, or null for none (a form may send a string). */
function initiativeValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Clears the shown initiative inside an update that gives the combatant
 * another initiative (a roll, a manual change, a clear). An update that only
 * repeats the current one — the combatant's own form sends it along with a
 * new name or image — keeps it. The flag is set to null rather than deleted,
 * the same in v13 and v14. Mutates `changes`; returns whether it did.
 */
export function forgetShownInitiative(changes, shown, current) {
  if (shown === undefined || shown === null || !changes || !("initiative" in changes)) return false;
  if (repeatsInitiative(changes, current)) return false;
  return markShownForgotten(changes);
}

/** Whether an update sets the initiative the combatant already has. */
function repeatsInitiative(changes, current) {
  return "initiative" in (changes ?? {}) && initiativeValue(changes.initiative) === initiativeValue(current);
}

/** Adds the forgetting of the shown initiative to an update. Mutates `changes`; returns true. */
function markShownForgotten(changes) {
  changes.flags ??= {};
  changes.flags[MODULE_ID] ??= {};
  changes.flags[MODULE_ID][INITIATIVE_SHOWN_FLAG] = null;
  return true;
}

/**
 * The same for Combat#resetAll(), which sends every combatant whole, its
 * initiative cleared, in one update of the combat: each cleared one forgets
 * its shown number. Mutates `changes`; returns how many it cleared.
 */
export function forgetShownOnReset(changes) {
  if (!Array.isArray(changes?.combatants)) return 0;
  let cleared = 0;
  for (const data of changes.combatants) {
    const flags = data?.flags?.[MODULE_ID];
    if (Number.isFinite(data?.initiative) || flags?.[INITIATIVE_SHOWN_FLAG] === undefined || flags[INITIATIVE_SHOWN_FLAG] === null) continue;
    flags[INITIATIVE_SHOWN_FLAG] = null;
    cleared += 1;
  }
  return cleared;
}

/** Whether a chat message is one of Foundry's initiative rolls (`Combat#rollInitiative`, which dnd5e and most systems use). */
export function isInitiativeRollMessage(flags) {
  return Boolean(flags?.core?.initiativeRoll ?? flags?.["core.initiativeRoll"]);
}

/**
 * The combatants a roll message speaks for: its token on its scene, or, for a
 * combatant without a token, its actor. `combatants` are plain
 * `{ tokenId, sceneId, actorId }` shapes whose `sceneId` is the scene the
 * token really is on (a combatant may leave its own empty and take the
 * combat's); when neither side knows the scene, the token alone decides.
 */
export function combatantsOfSpeaker(speaker, combatants) {
  if (!speaker) return [];
  if (speaker.token) {
    return combatants.filter((c) => c.tokenId === speaker.token && (!speaker.scene || !c.sceneId || c.sceneId === speaker.scene));
  }
  if (speaker.actor) return combatants.filter((c) => !c.tokenId && c.actorId === speaker.actor);
  return [];
}

/**
 * Whether an initiative roll must go to the GM only: the message would be
 * public (a whisper, a blind or a self roll is left as it is), and it rolls
 * for someone players may not know about yet — not friendly, no virtual
 * position — while the world hides enemies' initiative (#11), or conceals
 * enemies (#14) and that one has not been revealed: the message names its
 * speaker.
 */
export function shouldKeepRollFromPlayers({ hideEnemyInitiative, concealEnemyIdentity = false, whisper, rolled }) {
  if ((!hideEnemyInitiative && !concealEnemyIdentity) || (whisper?.length ?? 0) > 0) return false;
  const enemies = rolled.filter((c) => !c.virtual && c.disposition !== DISPOSITION.FRIENDLY);
  if (hideEnemyInitiative) return enemies.length > 0;
  return enemies.some((c) => !c.revealed);
}

/**
 * `Combat#rollInitiative`'s `messageOptions`, which Foundry merges into each
 * roll message (v13 and v14), with the combat the roll belongs to added under
 * the module's flags: the message then names its own encounter, whichever one
 * the user views by the time it is created. The caller's options are kept.
 */
export function withRolledIn(messageOptions, combatId) {
  const options = messageOptions ?? {};
  const flags = options.flags ?? {};
  return { ...options, flags: { ...flags, [MODULE_ID]: { ...(flags[MODULE_ID] ?? {}), [ROLLED_IN_FLAG]: combatId } } };
}

/** The id of the combat a roll message was rolled in, or null when it does not say. */
export function rolledInOf(flags) {
  return flags?.[MODULE_ID]?.[ROLLED_IN_FLAG] ?? null;
}

/**
 * The combats an initiative roll message is known to belong to (ids): the one
 * the message names (core's roll, wrapped), else those with a roll of their
 * own under way that hold its token (a system that creates its messages
 * before calling core, PF2e). Empty when the message does not tell — never
 * the combat the user happens to view. `candidates` are the combats holding
 * the message's token or actor.
 */
export function rollOrigin({ rolledIn, rolling, candidates }) {
  if (rolledIn) return [rolledIn];
  return candidates.filter((id) => rolling.includes(id));
}
