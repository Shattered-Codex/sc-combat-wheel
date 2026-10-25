/**
 * What a virtual position can do when its turn comes (RF-63, RF-68), in the
 * spirit of SC Puzzle Engine's consequences. Each kind says where it runs:
 * "local" runs on every client that can see the position (screen, sound, hook),
 * "gm" runs once on the active GM (anything that writes or talks to other
 * modules). `requires` names a module that must be active.
 *
 * Field types: text, textarea, number, select (with `choices`), macro, file,
 * uuid (accepts a dropped document), resource target.
 */
export const CONSEQUENCE_KINDS = Object.freeze({
  screenMessage: {
    where: "local",
    icon: "fa-message",
    fields: [
      { name: "title", type: "text", default: "" },
      { name: "text", type: "textarea", default: "" },
      { name: "audience", type: "select", choices: ["all", "gm"], default: "all" },
      { name: "seconds", type: "number", min: 2, max: 30, default: 6 },
    ],
  },
  chatMessage: {
    where: "gm",
    icon: "fa-comment",
    fields: [
      { name: "text", type: "textarea", default: "" },
      { name: "audience", type: "select", choices: ["all", "gm"], default: "all" },
    ],
  },
  sound: {
    where: "local",
    icon: "fa-volume-high",
    fields: [
      { name: "src", type: "file", fileType: "audio", default: "" },
      { name: "volume", type: "number", min: 0, max: 100, default: 70 },
    ],
  },
  hook: {
    where: "local",
    icon: "fa-code-branch",
    fields: [{ name: "name", type: "text", default: "" }],
  },
  macro: {
    where: "gm",
    icon: "fa-terminal",
    fields: [{ name: "macroUuid", type: "macro", default: "" }],
  },
  rollTable: {
    where: "gm",
    icon: "fa-table-list",
    fields: [{ name: "tableUuid", type: "uuid", documentName: "RollTable", default: "" }],
  },
  jumpScare: {
    where: "gm",
    icon: "fa-ghost",
    requires: "sc-jump-scare",
    fields: [{ name: "scareId", type: "text", default: "" }],
  },
  puzzle: {
    where: "gm",
    icon: "fa-puzzle-piece",
    requires: "sc-puzzle-engine",
    fields: [
      { name: "puzzleUuid", type: "uuid", documentName: "JournalEntryPage", default: "" },
      { name: "action", type: "select", choices: ["open", "arm", "trigger"], default: "open" },
    ],
  },
  resource: {
    where: "gm",
    icon: "fa-battery-half",
    requires: "sc-resources",
    fields: [
      { name: "target", type: "select", choices: ["party", "combatants", "actor"], default: "party" },
      { name: "actorUuid", type: "uuid", documentName: "Actor", default: "" },
      { name: "resourceId", type: "text", default: "" },
      { name: "operation", type: "select", choices: ["add", "subtract", "set", "restore"], default: "add" },
      { name: "amount", type: "number", min: -9999, max: 9999, default: 1 },
    ],
  },
});

function randomId() {
  return Math.random().toString(36).slice(2, 12);
}

/** A consequence row with a known kind and every field typed and defaulted. */
export function normalizeConsequence(raw = {}) {
  const kind = CONSEQUENCE_KINDS[raw.kind] ? raw.kind : "screenMessage";
  const params = {};
  for (const field of CONSEQUENCE_KINDS[kind].fields) {
    const value = raw.params?.[field.name];
    if (field.type === "number") {
      const number = Number(value);
      params[field.name] = Number.isFinite(number)
        ? Math.min(Math.max(number, field.min ?? -Infinity), field.max ?? Infinity)
        : field.default;
    } else if (field.type === "select") {
      params[field.name] = field.choices.includes(value) ? value : field.default;
    } else {
      params[field.name] = String(value ?? field.default).trim();
    }
  }
  return { id: String(raw.id || randomId()), kind, enabled: raw.enabled !== false, params };
}

/** A fresh row of `kind`, all defaults. */
export function newConsequence(kind) {
  return normalizeConsequence({ kind });
}

/**
 * Rows that should run on this client: local ones where the position is
 * visible (GM-only messages on GM clients), gm ones on the active GM only.
 */
export function consequencesToRun(rows, { visible, isGM, isActiveGM, isModuleActive }) {
  return rows.filter((row) => {
    if (!row.enabled) return false;
    const kind = CONSEQUENCE_KINDS[row.kind];
    if (!kind || (kind.requires && !isModuleActive(kind.requires))) return false;
    if (kind.where === "gm") return isActiveGM;
    if (row.kind === "screenMessage" && row.params.audience === "gm") return visible && isGM;
    return visible;
  });
}
