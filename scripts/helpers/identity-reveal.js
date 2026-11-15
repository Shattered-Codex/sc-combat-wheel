import { DISPOSITION } from "../constants/module-constants.js";

/**
 * #14: the flag (`flags.sc-combat-wheel.identityRevealed`) the active GM sets
 * on a combatant when its first real turn comes up. Once set it stays: a
 * reroll, a reset of the initiatives, later rounds and reloads keep the
 * identity players already saw. A combatant removed and added again is a new
 * document, without it.
 */
export const IDENTITY_REVEALED_FLAG = "identityRevealed";

/**
 * How players see an enemy still unknown: as they are ("off"), as an
 * "Unknown" placeholder in its slot, or not at all until its turn ("omit").
 */
export const CONCEAL_MODES = Object.freeze(["off", "placeholder", "omit"]);

/** The mode a stored value means; the first test builds stored a yes/no, a yes being the placeholder. */
export function concealModeOf(value) {
  if (CONCEAL_MODES.includes(value)) return value;
  return value === true || value === "true" ? "placeholder" : "off";
}

/** The picture Foundry ships for an unknown figure; the core tracker shows it in place of a concealed portrait. */
export const UNKNOWN_PORTRAIT = "icons/svg/mystery-man.svg";

/**
 * Whether this viewer must not know who the combatant is yet: the world
 * conceals enemies, the viewer is a player who does not own it, it is not
 * friendly (the same line as the hidden initiative, #11), it is no virtual
 * position, and neither has its turn revealed it nor is it acting right now.
 * `acting` lets every client show it the moment its turn arrives, before the
 * GM's flag comes back. `concealEnemyIdentity` is a mode (CONCEAL_MODES).
 */
export function isIdentityHidden({ revealed, acting, disposition, isOwner, virtual }, { isGM, concealEnemyIdentity }) {
  if (concealModeOf(concealEnemyIdentity) === "off" || isGM || isOwner || virtual) return false;
  if (disposition === DISPOSITION.FRIENDLY) return false;
  return !revealed && !acting;
}

/**
 * Whether the active GM should record the acting combatant as revealed: the
 * combat has started, players can see it (a hidden combatant's turn shows
 * them nothing), it is not revealed yet, and the turn is not one the module
 * skips at once (a dead combatant passed over never had its turn).
 */
export function shouldRecordRevealed({ started, revealed, concealed, skipped }) {
  return Boolean(started) && !revealed && !concealed && !skipped;
}

/**
 * The dead-turn rule (RF-46) that decides whether an acting combatant only
 * passes through, as the skip would see it: under SC Venaerys's Initiative
 * the fallen never act; a step back never skips; a step forward, and a
 * change in the middle of a turn (`forward` unknown, as every player's
 * projection judges it), follow the world's rule.
 */
export function revealSkipRule({ phased, forward, skipDead }) {
  if (phased) return "all";
  if (forward === false) return "never";
  return skipDead;
}

/**
 * The placeholder a concealed combatant becomes: its turn-order slot, its
 * side and its initiative (which follows its own setting, #11) stay; the
 * name, every picture, the effects, the hit points and its players go. Pure.
 */
export function unidentifiedViewModel(vm, unknownName) {
  return {
    ...vm,
    identityHidden: true,
    name: unknownName,
    initials: "?",
    img: null,
    tokenImg: null,
    artImg: null,
    hp: { mode: "hidden" },
    healthTone: null,
    // Only the GM's hit points feed the dead-turn skip; a "down" read from the bar the player no longer sees is gone too.
    dead: vm.defeated,
    alive: !vm.defeated,
    players: [],
    cardUserId: null,
    effects: [],
  };
}

/** The combatant view models a WheelModel draws, by id, phase members included. */
export function viewModelsById(model) {
  const byId = new Map();
  for (const entry of model?.ring ?? []) {
    if (entry.kind !== "phase") byId.set(entry.id, entry);
    for (const member of entry.members ?? []) byId.set(member.id, member);
  }
  return byId;
}
