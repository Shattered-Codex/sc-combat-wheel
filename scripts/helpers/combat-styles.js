/**
 * RF-108: the GM's saved combat styles — named looks kept for the table — and
 * which one a combat draws with. A combat's own choice (a flag) wins; without
 * one, the table's default style applies; "none" means the usual look.
 */
export const NO_STYLE = "none";
const NAME_LIMIT = 60;

/** Keeps the well-formed styles: an id, a name and an object of values. */
export function normalizeStyles(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const styles = [];
  for (const style of raw) {
    const id = typeof style?.id === "string" ? style.id : "";
    const name = typeof style?.name === "string" ? style.name.trim().slice(0, NAME_LIMIT) : "";
    if (!id || id === NO_STYLE || !name || seen.has(id) || !style.values || typeof style.values !== "object") continue;
    seen.add(id);
    styles.push({ id, name, values: { ...style.values } });
  }
  return styles;
}

/**
 * The style a combat draws with, or null for the usual look.
 * @param {object} options
 * @param {object[]} options.styles   normalizeStyles() output
 * @param {string} [options.flag]     the combat's own choice, if it has one
 * @param {string} [options.defaultId] the table's default style
 */
export function chosenStyle({ styles, flag, defaultId }) {
  const id = flag || defaultId;
  if (!id || id === NO_STYLE) return null;
  return styles.find((style) => style.id === id) ?? null;
}

/** Saving under a name already taken replaces that style, keeping its id; a new name adds one. */
export function upsertStyle(styles, { name, values }, newId) {
  const clean = String(name ?? "").trim().slice(0, NAME_LIMIT);
  if (!clean) return styles;
  const index = styles.findIndex((style) => style.name.toLocaleLowerCase() === clean.toLocaleLowerCase());
  if (index >= 0) return styles.map((style, i) => (i === index ? { ...style, name: clean, values: { ...values } } : style));
  return [...styles, { id: newId, name: clean, values: { ...values } }];
}

/** Lower case without accents, so "agua" finds "Água". */
function folded(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().trim();
}

/**
 * The options whose name holds `query` (case and accents aside), names that
 * start with it first, each group in its original order. An empty query keeps all.
 * @param {{ name: string }[]} options
 */
export function filterStyleOptions(options, query) {
  const wanted = folded(query);
  if (!wanted) return [...options];
  const starts = [];
  const contains = [];
  for (const option of options) {
    const name = folded(option.name);
    if (name.startsWith(wanted)) starts.push(option);
    else if (name.includes(wanted)) contains.push(option);
  }
  return [...starts, ...contains];
}
