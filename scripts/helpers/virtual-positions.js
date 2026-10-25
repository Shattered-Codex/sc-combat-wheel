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
 * snapshot taken when it was added.
 */
export function configFor(flag, templates) {
  const template = templates.find((t) => t.id === flag.templateId);
  return template ? normalizeTemplate(template) : normalizeTemplate({ ...flag, id: flag.templateId });
}

/**
 * Auto-advance stops after walking the whole ring without meeting a real
 * combatant, so a combat made only of virtual positions cannot loop (RF-65).
 */
export function canAutoAdvance(chain, ringSize) {
  return chain < Math.max(1, ringSize);
}
