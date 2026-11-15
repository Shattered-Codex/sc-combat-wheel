import { MODULE_ID } from "../constants/module-constants.js";
import { normalizeConsequence } from "./consequence-kinds.js";

export const DEFAULT_VIRTUAL_IMAGE = "icons/svg/lightning.svg";

/**
 * A template as stored in the world setting (RF-61), with every field typed
 * and defaulted, so hand-edited or older data never breaks the wheel. Older
 * templates kept a single `hook` and `macroUuid`; they become consequences.
 */
export function normalizeTemplate(raw = {}) {
  const initiative = Number(raw.initiative);
  return {
    id: String(raw.id || randomId()),
    name: String(raw.name ?? "").trim() || "?",
    img: String(raw.img ?? "").trim() || DEFAULT_VIRTUAL_IMAGE,
    initiative: Number.isFinite(initiative) ? initiative : 20,
    hidden: Boolean(raw.hidden),
    autoAdvance: Boolean(raw.autoAdvance),
    autoAdd: Boolean(raw.autoAdd),
    consequences: consequencesOf(raw).map(normalizeConsequence),
  };
}

function consequencesOf(raw) {
  const rows = Array.isArray(raw.consequences) ? [...raw.consequences] : Object.values(raw.consequences ?? {});
  if (Array.isArray(raw.consequences)) return rows;
  if (raw.hook) rows.push({ kind: "hook", params: { name: raw.hook } });
  if (raw.macroUuid) rows.push({ kind: "macro", params: { macroUuid: raw.macroUuid } });
  return rows;
}

function randomId() {
  return Math.random().toString(36).slice(2, 12);
}

/** The virtual-position flag of a combatant, or null for ordinary combatants (RF-60). */
export function virtualFlagOf(combatant) {
  return combatant?.flags?.[MODULE_ID]?.virtual ?? null;
}

/** Combatant creation data for a template: no token, no actor, fixed initiative. */
export function combatantDataFor(template) {
  const { id, ...config } = normalizeTemplate(template);
  return {
    name: config.name,
    img: config.img,
    initiative: config.initiative,
    hidden: config.hidden,
    flags: { [MODULE_ID]: { virtual: { templateId: id, ...config } } },
  };
}

/**
 * The live configuration of a virtual combatant: its template when the GM
 * still has it (so edits apply to combats already running), otherwise the
 * snapshot taken when it was added. The snapshot lives in the combatant's
 * flags, which the owner of a combatant's actor may write: unless
 * `trustSnapshot` says only the GM could have (isGmOnlyCombatant), its
 * consequences are dropped — they run as the GM.
 */
export function configFor(flag, templates, { trustSnapshot = true } = {}) {
  const template = templates.find((t) => t.id === flag.templateId);
  if (template) return normalizeTemplate(template);
  const snapshot = normalizeTemplate({ ...flag, id: flag.templateId });
  return trustSnapshot ? snapshot : { ...snapshot, consequences: [] };
}

/**
 * Whether only a GM can write this combatant's flags: one with no actor
 * (as every virtual position is created) takes its permission from the
 * Combat, which players never own (v13 and v14). An actor's owner may edit
 * the flags of its combatants.
 */
export function isGmOnlyCombatant(combatant) {
  return !combatant?.actorId && !combatant?.actor;
}

/**
 * The inline script (a macro consequence with `source: "inline"`) a saved
 * template holds for one of its rows, or null. Only the world setting, which
 * only a GM can write, is a trusted origin: a script copied into a
 * combatant's flags is never run.
 */
export function trustedInlineScript(templates, templateId, rowId) {
  const template = templates.find((t) => t.id === templateId);
  const row = template?.consequences.find((c) => c.id === rowId);
  if (!row || row.kind !== "macro" || !row.enabled || row.params.source !== "inline") return null;
  return row.params.script || null;
}

/**
 * Auto-advance stops after walking the whole ring without meeting a real
 * combatant, so a combat made only of virtual positions cannot loop (RF-65).
 */
export function canAutoAdvance(chain, ringSize) {
  return chain < Math.max(1, ringSize);
}
