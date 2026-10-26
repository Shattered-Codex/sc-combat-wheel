/**
 * Where hit points come from (RF-47). Paths are relative to `actor.system` and
 * name the parent of `value`/`max`, like SC Sidebar Party's resource paths.
 * `inverted` marks systems whose value counts damage taken (Daggerheart marks
 * hit points, SWADE and Imperium Maledictum count wounds): health is then
 * `max − value`. Presets still need checking against each system's current
 * version (SPEC §5.4).
 */
const HEALTH_PRESETS = Object.freeze({
  dnd5e: { path: "attributes.hp", inverted: false },
  pf2e: { path: "attributes.hp", inverted: false },
  daggerheart: { path: "resources.hitPoints", inverted: true },
  CoC7: { path: "attribs.hp", inverted: false },
  swade: { path: "wounds", inverted: true },
  impmal: { path: "combat.wounds", inverted: true },
  projectfu: { path: "resources.hp", inverted: false },
});

/**
 * The effective health source.
 * @param {object} options
 * @param {"auto"|"bar1"|"bar2"|"attribute"} options.source
 * @param {string} options.path                     used by "attribute"
 * @param {boolean} options.inverted                used by "attribute"
 * @param {string} options.systemId                 game.system.id, for "auto"
 * @param {string} [options.primaryTokenAttribute]  the system's default bar, for "auto"
 * @returns {{ kind: "bar", bar: string } | { kind: "path", path: string, inverted: boolean }}
 */
export function healthSourceFor({ source, path, inverted, systemId, primaryTokenAttribute }) {
  if (source === "bar1" || source === "bar2") return { kind: "bar", bar: source };
  if (source === "attribute" && String(path ?? "").trim()) {
    return { kind: "path", path: String(path).trim(), inverted: Boolean(inverted) };
  }
  const preset = HEALTH_PRESETS[systemId];
  if (preset) return { kind: "path", ...preset };
  if (primaryTokenAttribute) return { kind: "path", path: primaryTokenAttribute, inverted: false };
  return { kind: "bar", bar: "bar1" };
}

function getPath(object, path) {
  return path.split(".").reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), object);
}

/**
 * Remaining health `{ value, max }`, or null when the source has nothing usable.
 * @param {object} combatant  reads `actor.system` or `token.getBarAttribute`
 */
export function readHealth(combatant, source) {
  if (source.kind === "bar") {
    const bar = combatant.token?.getBarAttribute?.(source.bar);
    if (!bar || bar.type !== "bar") return null;
    return finite(bar.value, bar.max);
  }
  const system = combatant.actor?.system;
  if (!system) return null;
  const node = getPath(system, source.path);
  const raw = typeof node === "object" && node !== null ? node.value : node;
  const max = typeof node === "object" && node !== null ? node.max : getPath(system, `${source.path}.max`);
  const health = finite(raw, max);
  if (!health || !source.inverted) return health;
  return { value: Math.max(health.max - health.value, 0), max: health.max };
}

function finite(value, max) {
  const v = Number(value);
  const m = Number(max);
  return Number.isFinite(v) && Number.isFinite(m) && m > 0 ? { value: v, max: m } : null;
}

/** Colour band of a health ratio, as SC Sidebar Party draws it. */
export function healthTone(ratio) {
  if (ratio <= 0.25) return "danger";
  if (ratio <= 0.5) return "warn";
  return "good";
}
