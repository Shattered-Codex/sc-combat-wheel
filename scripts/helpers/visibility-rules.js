import { DISPOSITION, TOKEN_DISPLAY } from "../constants/module-constants.js";

/** RF-40, RF-41, RF-45: whether a combatant belongs on this user's ring at all. */
export function isOnRing({ concealed, dead }, { isGM, defeatedMode }) {
  if (dead && defeatedMode === "remove") return false;
  if (concealed && !isGM) return false;
  return true;
}

/**
 * RF-45: whether players must not see this combatant. Always when the
 * combatant is hidden; by world setting also when its token is hidden on the
 * canvas ("tokenHidden") or when it is hidden or invisible ("invisible").
 */
export function isConcealed({ hidden, tokenHidden, invisible }, concealment) {
  if (hidden) return true;
  if (concealment === "tokenHidden" || concealment === "invisible") {
    if (tokenHidden) return true;
  }
  return concealment === "invisible" && Boolean(invisible);
}

/**
 * RF-41: "dead" as this viewer may know it — defeated, or down by the hit
 * points they are allowed to see. Secret hit points never give it away.
 */
export function isDeadForViewer({ defeated }, hp) {
  if (defeated) return true;
  if (hp.stateKey) return hp.stateKey === "down";
  return hp.mode === "bar" && hp.pct === 0;
}

/**
 * RF-46: whether the GM's client should skip this turn. "npcs" skips dead
 * combatants no player owns (players keep their turn, e.g. for death saves);
 * "all" skips every dead combatant. Uses the GM's exact hit points.
 */
export function shouldSkipTurn({ defeated, hpTotal, hasPlayerOwner, virtual }, mode) {
  if (virtual || mode === "never" || !mode) return false;
  const dead = defeated || (hpTotal ? hpTotal.value <= 0 : false);
  if (!dead) return false;
  return mode === "all" || !hasPlayerOwner;
}

/** SPEC §5.2 descriptive bands. */
export function healthState(value, max) {
  if (value <= 0) return "down";
  const ratio = value / max;
  if (ratio >= 1) return "unhurt";
  if (ratio <= 0.25) return "critical";
  if (ratio <= 0.5) return "bloodied";
  return "wounded";
}

/** Bar fill for viewers who may only know the band, never the exact ratio. */
const STATE_FILL = { unhurt: 1, wounded: 0.75, bloodied: 0.5, critical: 0.25, down: 0 };
const CRITICAL_RATIO = 0.3;

/**
 * RF-42: what this viewer may see of a combatant's hit points.
 * Owners, the GM and viewers of friendly combatants see the exact value;
 * everyone else gets the world's `hpForPlayers` mode.
 */
export function hpView(hp, { isGM, isOwner, disposition, hpForPlayers }) {
  if (!hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max) || hp.max <= 0) {
    return { mode: "none" };
  }
  const ratio = Math.min(Math.max(hp.value / hp.max, 0), 1);
  const stateKey = healthState(hp.value, hp.max);
  const exact = isGM || isOwner || disposition === DISPOSITION.FRIENDLY;
  const mode = exact ? "number" : hpForPlayers;

  if (mode === "number") {
    return { mode, text: `${hp.value}/${hp.max}`, pct: ratio, critical: ratio <= CRITICAL_RATIO, stateKey };
  }
  if (mode === "bar") return { mode, pct: ratio, critical: ratio <= CRITICAL_RATIO, stateKey: null };
  if (mode === "state") {
    const fill = STATE_FILL[stateKey];
    return { mode, pct: fill, critical: fill <= 0.25, stateKey };
  }
  return { mode: "hidden" };
}

/** RF-44: the name this viewer may read. `null` means "use the unknown label". */
export function visibleName(name, { isGM, isOwner, npcNames, tokenDisplayName }) {
  if (isGM || isOwner || npcNames !== "token") return name;
  if (tokenDisplayName === undefined || tokenDisplayName === null) return name;
  const readable = tokenDisplayName === TOKEN_DISPLAY.HOVER || tokenDisplayName === TOKEN_DISPLAY.ALWAYS;
  return readable ? name : null;
}

/** Up to two initials, keeping a trailing number ("Goblin 2" → "G2"). */
export function initialsOf(name) {
  const text = String(name ?? "").trim();
  if (!text) return "?";
  const number = text.match(/\s(\d+)$/)?.[1] ?? "";
  const words = text.replace(/\s\d+$/, "").split(/\s+/).filter(Boolean);
  const letters = words.slice(0, number ? 1 : 2).map((word) => word[0].toUpperCase()).join("");
  return letters + number;
}
