import { upgradeLook } from "./look-upgrades.js";

/**
 * RF-120: a look as a file, to take it to another world or hand it to
 * someone. Only appearance values travel (no sounds, no world settings); the
 * editor checks each one against its setting when it loads them. Pure: no DOM,
 * no Foundry globals.
 */
export const LOOK_FILE_TYPE = "sc-combat-wheel-look";
const LOOK_FILE_VERSION = 1;
const NAME_LIMIT = 60;

/**
 * @param {object} values  appearance values by setting key
 * @param {object} [meta]
 * @param {string} [meta.name]      a name for whoever imports it
 * @param {string} [meta.exported]  when, as an ISO date
 */
export function lookFile(values, { name = "", exported = new Date().toISOString() } = {}) {
  return { type: LOOK_FILE_TYPE, version: LOOK_FILE_VERSION, name: String(name).slice(0, NAME_LIMIT), exported, values: { ...values } };
}

/**
 * The look a file holds, its old options upgraded, or null when the text is
 * not a look file (another module's export, a broken file).
 * @param {string} text
 * @returns {{ name: string, values: object } | null}
 */
export function readLookFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data?.type !== LOOK_FILE_TYPE || !data.values || typeof data.values !== "object" || Array.isArray(data.values)) return null;
  const name = typeof data.name === "string" ? data.name.trim().slice(0, NAME_LIMIT) : "";
  return { name, values: upgradeLook(data.values) };
}

/** A file name for a look: its name, or its theme, made safe. */
export function lookFileName(name, theme) {
  const base = String(name || theme || "look").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `sc-combat-wheel-${base || "look"}.json`;
}
