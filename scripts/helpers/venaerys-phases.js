/**
 * Read-only view of a combat run by SC Venaerys's Initiative (RF-80, D-27).
 * That module exposes no API for its phases, so this mirrors the rules it
 * documents for its flags: a combat runs in phases when
 * `flags.sc-venaerys-initiative.enabled` is true and `plan` is a valid plan;
 * a combatant's `phase` names its phase, `done` and `moved` hold the round in
 * which it finished acting or moving. The current phase is the one of the
 * combatant under the pointer. Pure: nothing here reads Foundry globals.
 */
export const VENAERYS_ID = "sc-venaerys-initiative";

const BUILTIN_ORDER = Object.freeze(["fast", "enemies", "slow"]);
const PHASE_TYPES = new Set([...BUILTIN_ORDER, "creatures", "event"]);
const PLAYER_PHASE_TYPES = new Set(["fast", "slow"]);
const COLOR = /^#[0-9a-f]{6}$/i;

export function venaerysFlags(document) {
  return document?.flags?.[VENAERYS_ID] ?? {};
}

function isValidPhase(phase) {
  if (!phase || typeof phase !== "object") return false;
  if (typeof phase.id !== "string" || !phase.id || !PHASE_TYPES.has(phase.type)) return false;
  if (BUILTIN_ORDER.includes(phase.type) && phase.id !== phase.type) return false;
  if (typeof phase.icon !== "string" || !phase.icon) return false;
  if (typeof phase.color !== "string" || !COLOR.test(phase.color)) return false;
  const named = (typeof phase.name === "string" && phase.name.trim()) || (typeof phase.nameKey === "string" && phase.nameKey);
  return Boolean(named);
}

/** Venaerys's own plan check: unique ids, each built-in once, Fast before Enemies before Slow. */
export function isValidPlan(plan) {
  if (!Array.isArray(plan) || !plan.every(isValidPhase)) return false;
  const ids = plan.map((phase) => phase.id);
  if (new Set(ids).size !== ids.length) return false;
  const positions = BUILTIN_ORDER.map((id) => ids.indexOf(id));
  if (positions.some((position) => position < 0)) return false;
  if (BUILTIN_ORDER.some((type) => plan.filter((phase) => phase.type === type).length !== 1)) return false;
  return positions.every((position, i) => i === 0 || position > positions[i - 1]);
}

/** The combat's phase plan when Venaerys runs it, else null. */
export function phasePlanOf(combat) {
  const flags = venaerysFlags(combat);
  if (flags.enabled !== true) return null;
  return isValidPlan(flags.plan) ? flags.plan : null;
}

/** The phase id under the pointer, or null before the start or on someone with no phase. */
export function currentPhaseIdOf(combat, plan = phasePlanOf(combat)) {
  if (!plan || !(combat?.round > 0) || !Number.isInteger(combat.turn)) return null;
  const pointer = Array.from(combat.turns ?? [])[combat.turn];
  const phaseId = venaerysFlags(pointer).phase;
  return plan.some((phase) => phase.id === phaseId) ? phaseId : null;
}

/** Whether a phase splits into a movement half and an actions half; event phases never do. */
function isSplitPhase(combat, phase) {
  if (!phase || phase.type === "event") return false;
  const split = venaerysFlags(combat).split;
  if (split === "all") return true;
  return split === "players" && PLAYER_PHASE_TYPES.has(phase.type);
}

/** "move" or "act" in a split phase, null otherwise. The actions half runs while `actionsHalf` holds `round:phase`. */
export function currentHalfOf(combat, phase) {
  if (!isSplitPhase(combat, phase)) return null;
  return venaerysFlags(combat).actionsHalf === `${combat.round}:${phase.id}` ? "act" : "move";
}

/**
 * Where a phased combat stands, for telling a real phase change from a done
 * mark: `round:phase`, or null when the pointer is on no phase.
 */
export function phasePositionOf(combat) {
  const phaseId = currentPhaseIdOf(combat);
  return phaseId === null ? null : `${combat.round}:${phaseId}`;
}

/**
 * How far a combatant got this round in a phase: "done" when it finished (in
 * the movement half, once it moved), "acting" otherwise. Defeat is the
 * caller's to show.
 */
export function memberProgress(combatant, { round, half }) {
  const flags = venaerysFlags(combatant);
  const done = flags.done === round;
  if (half === "move") return done || flags.moved === round ? "done" : "acting";
  return done ? "done" : "acting";
}

/** The name a client shows: the GM's own text, else Venaerys's translated default. */
export function phaseName(phase, localize) {
  if (typeof phase?.name === "string" && phase.name.trim()) return phase.name;
  return phase?.nameKey ? localize(phase.nameKey) : "";
}
