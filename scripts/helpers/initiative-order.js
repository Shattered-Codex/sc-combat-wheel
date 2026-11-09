/**
 * An initiative that sorts between two neighbours of Foundry's descending turn
 * order (RF-33, RF-69). `before` acts earlier (higher), `after` acts later;
 * either may be null at the ends of the order or for combatants without
 * initiative. Ties keep the earlier neighbour's value.
 */
export function initiativeBetween(before, after) {
  const hasBefore = Number.isFinite(before);
  const hasAfter = Number.isFinite(after);
  if (!hasBefore && !hasAfter) return 20;
  if (!hasBefore) return after + 1;
  if (!hasAfter) return before - 1;
  if (before - after <= 0.01) return before;
  return Math.round(((before + after) / 2) * 100) / 100;
}

/**
 * The initiative that lands at `slot` (0 = first) of `ring`, the list of
 * initiatives in combat order. The neighbours are the nearest ones that have
 * an initiative: Foundry puts everyone without one at the end, so no number
 * can sort after them, and a slot among them lands just before them instead.
 */
export function initiativeAtSlot(ring, slot) {
  const before = ring.slice(0, slot).findLast(Number.isFinite) ?? null;
  const after = ring.slice(slot).find(Number.isFinite) ?? null;
  return initiativeBetween(before, after);
}

/**
 * The last slot anything can be put in: just before the first combatant
 * without initiative, since Foundry keeps them all at the end.
 */
export function lastReachableSlot(ring) {
  const first = ring.findIndex((initiative) => !Number.isFinite(initiative));
  return first < 0 ? ring.length : first;
}

/**
 * Where something put at `slot` really lands, in the same numbering: a new
 * position (`from` -1), or the combatant at `from` being dragged. A slot past
 * the combatants without initiative becomes the one just before them.
 */
export function landingSlot(ring, slot, from = -1) {
  if (from < 0) return Math.min(slot, lastReachableSlot(ring));
  const { rest, target } = ringForMove(ring, from, slot);
  const landed = Math.min(target, lastReachableSlot(rest));
  return landed >= from ? landed + 1 : landed;
}

/** The ring without the combatant at `from`, and the slot `slot` becomes in it. */
export function ringForMove(ring, from, slot) {
  const rest = ring.filter((_, index) => index !== from);
  return { rest, target: Math.min(Math.max(slot > from ? slot - 1 : slot, 0), rest.length) };
}

/**
 * The initiative a combatant needs to land at `slot` (0 = first) of `ring`,
 * the list of initiatives in combat order, once it is taken out of `from`.
 */
export function initiativeForMove(ring, from, slot) {
  const { rest, target } = ringForMove(ring, from, slot);
  return initiativeAtSlot(rest, target);
}
