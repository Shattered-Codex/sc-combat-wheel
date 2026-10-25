/** Sound events from the most to the least specific (RF-51). */
export const SOUND_EVENTS = Object.freeze(["combatStart", "turnBack", "ownTurn", "nextUp", "roundStart", "turnChange", "combatEnd"]);

/** Whether the turn moved forward: a later round, or a later turn in the same round. */
export function isForward(previous, next) {
  if (next.round !== previous.round) return next.round > previous.round;
  return (next.turn ?? 0) > (previous.turn ?? 0);
}

/** Whether anything about the turn changed at all. */
export function turnChanged(previous, next) {
  return previous.round !== next.round || previous.turn !== next.turn;
}

/**
 * The one sound event a real turn change plays for this user (RF-50, RF-51),
 * or null. `previous` is `{ round, turn }` before the change; `model` is the
 * projected WheelModel after it. The GM owns every NPC, so "own turn" and
 * "next up" never fire for the GM (RF-54). `turnBack` says the user set a
 * sound for going back a turn (RF-101).
 */
export function soundEventFor(previous, model, { isGM, turnBack = false }) {
  if (!previous || !model || !turnChanged(previous, model)) return null;
  if (previous.round === 0 && model.round >= 1) return "combatStart";
  // Only when that sound is set: otherwise going back plays what going forward would.
  if (turnBack && !isForward(previous, model)) return "turnBack";
  const current = model.activeHidden ? null : model.current;
  if (!isGM && current?.isOwner && !current.virtual) return "ownTurn";
  const next = model.nextUp;
  if (!isGM && next?.isOwner && !next.virtual && next.id !== current?.id) return "nextUp";
  if (model.round > previous.round) return "roundStart";
  return "turnChange";
}
