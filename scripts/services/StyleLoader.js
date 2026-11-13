import { MODULE_ID, STYLESHEETS } from "../constants/module-constants.js";

/** Settles once the sheet loads or fails: a missing sheet must not hold the wheel back. */
function settled(link) {
  if (typeof link.addEventListener !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      link.removeEventListener("load", finish);
      link.removeEventListener("error", finish);
      resolve();
    };
    link.addEventListener("load", finish);
    link.addEventListener("error", finish);
  });
}

/**
 * Adds the module's stylesheets to the page, unlayered. Foundry puts the
 * stylesheets of a manifest into its `modules` cascade layer, and any
 * unlayered rule beats every layered one, whatever its specificity: a UI
 * theme that injects its own sheet (Carolingian UI frames every `fieldset`)
 * would restyle the wheel and its settings. Unlayered, the module's own rules
 * win by their weight, all scoped under `.sc-combat-wheel*`. The version in
 * the URL keeps a browser from serving last release's sheet.
 */
export default class StyleLoader {
  /** Every sheet added so far, loaded (or failed). */
  static #loaded = Promise.resolve();

  /** Once, at init: the module's own version stamps the URLs. */
  static install() {
    return StyleLoader.inject({ version: globalThis.game?.modules?.get(MODULE_ID)?.version ?? "" });
  }

  /** The wheel and the editor's preview measure their controls: they wait for the sheets first. */
  static ensureLoaded() {
    return StyleLoader.#loaded;
  }

  static inject({ version = "" } = {}) {
    const head = globalThis.document?.head;
    if (!head) return [];
    const loads = [];
    const links = STYLESHEETS.map((file, index) => {
      const id = `${MODULE_ID}-style-${index}`;
      const existing = head.querySelector(`link#${id}`);
      if (existing) return existing;
      const link = globalThis.document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      // Listen before the request starts, so a cached sheet's load is not missed.
      loads.push(settled(link));
      link.href = `modules/${MODULE_ID}/${file}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
      head.append(link);
      return link;
    });
    if (loads.length) StyleLoader.#loaded = Promise.all([StyleLoader.#loaded, ...loads]).then(() => {});
    return links;
  }
}
