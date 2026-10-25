/**
 * A ContextMenu entry in the shape the running Foundry reads. v14 renamed the
 * fields (`label`, `visible`, `onClick`) and only warns about the v13 ones
 * (`name`, `condition`, `callback`), so each version gets its own.
 * @param {object} entry
 * @param {string} entry.label       localization key
 * @param {string} entry.icon        Font Awesome classes, e.g. "fa-solid fa-gear"
 * @param {() => boolean} entry.visible
 * @param {() => void} entry.onClick
 * @param {number} generation        game.release.generation
 */
export function contextMenuEntry({ label, icon, visible, onClick }, generation) {
  const iconHtml = `<i class="${icon}"></i>`;
  if (generation >= 14) return { label, icon: iconHtml, visible, onClick };
  return { name: label, icon: iconHtml, condition: visible, callback: onClick };
}
