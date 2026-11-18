import { DISPOSITION, DISPOSITION_KEYS, TOKEN_DISPLAY } from "../constants/module-constants.js";
import { removedWhenDefeated } from "./defeated-look.js";

/**
 * RF-40, RF-41, RF-45: whether a combatant belongs on this user's ring at
 * all. #14: an enemy still unknown is left out too when the world says so.
 * #16: the defeated may go, all of them or NPCs only.
 */
export function isOnRing({ concealed, dead, identityHidden, hasPlayerOwner }, { isGM, defeatedMode, omitUnidentified = false }) {
  if (dead && removedWhenDefeated(defeatedMode, { hasPlayerOwner })) return false;
  if (concealed && !isGM) return false;
  if (identityHidden && omitUnidentified) return false;
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
  return Boolean(defeated) || isDownForViewer(hp);
}

/** Whether the hit points this viewer may know say 0 (#15 reads it apart from Foundry's defeated mark). */
export function isDownForViewer(hp) {
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
 * Owners and the GM see the exact value. Other players use the disposition's
 * policy, or hpForPlayers when it inherits the default. Missing overrides
 * preserve the old rule: friendly combatants exact, everyone else the default.
 */
export function hpView(hp, { isGM, isOwner, disposition, hpForPlayers, hpByDisposition = {} }) {
  if (!hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max) || hp.max <= 0) {
    return { mode: "none" };
  }
  const ratio = Math.min(Math.max(hp.value / hp.max, 0), 1);
  const stateKey = healthState(hp.value, hp.max);
  const policy = hpByDisposition[DISPOSITION_KEYS[disposition]]
    ?? (disposition === DISPOSITION.FRIENDLY ? "number" : "default");
  const mode = isGM || isOwner ? "number" : policy === "default" ? hpForPlayers : policy;

  if (mode === "number") {
    return { mode, text: `${hp.value}/${hp.max}`, value: hp.value, max: hp.max, pct: ratio, critical: ratio <= CRITICAL_RATIO, stateKey };
  }
  if (mode === "bar") return { mode, pct: ratio, critical: ratio <= CRITICAL_RATIO, stateKey: null };
  if (mode === "state") {
    const fill = STATE_FILL[stateKey];
    return { mode, pct: fill, critical: fill <= 0.25, stateKey };
  }
  return { mode: "hidden" };
}

/**
 * #9: the hit points a portrait may print, in every format the look offers,
 * or null. Only the exact mode has numbers: a bar or a descriptive state never
 * turns into a figure, not even a percentage of the bar.
 */
export function portraitHpLabel(hp) {
  if (hp?.mode !== "number" || !Number.isFinite(hp.value) || !Number.isFinite(hp.max)) return null;
  return {
    fraction: `${hp.value}/${hp.max}`,
    current: String(hp.value),
    percent: `${Math.round(hp.pct * 100)}%`,
  };
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
