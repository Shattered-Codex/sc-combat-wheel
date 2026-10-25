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
 * The initiative a combatant needs to land at `slot` (0 = first) of `ring`,
 * the list of initiatives in combat order, once it is taken out of `from`.
 */
export function initiativeForMove(ring, from, slot) {
  const rest = ring.filter((_, index) => index !== from);
  const target = Math.min(Math.max(slot > from ? slot - 1 : slot, 0), rest.length);
  return initiativeBetween(rest[target - 1] ?? null, rest[target] ?? null);
}
