import { DISCORD_URL, I18N_ROOT, MODULE_ID, PATREON_URL, WIKI_URL } from "../constants/module-constants.js";

const LINKS = Object.freeze([
  Object.freeze({ id: "wiki", url: WIKI_URL, icon: "fa-solid fa-hat-wizard" }),
  Object.freeze({ id: "patreon", url: PATREON_URL, icon: "fa-solid fa-heart" }),
  Object.freeze({ id: "discord", url: DISCORD_URL, icon: "fa-brands fa-discord" }),
]);
const NOTE_LINES = Object.freeze(["NoteSupport", "NoteFeedback"]);

/**
 * The wiki, Patreon and Discord links, with a word asking for support, at the
 * end of the module's section in Foundry's settings — the same strip as SC
 * Item Rarity Colors. Registered menus would each draw a label, a hint and a
 * button for what are only links, so they are added as one compact strip.
 */
export default class CommunityLinks {
  static inject(html) {
    const section = CommunityLinks.#moduleSection(html);
    if (!section || section.querySelector(".scw-community-links")) return null;
    const t = (key) => game.i18n.localize(`${I18N_ROOT}.Community.${key}`);

    const strip = document.createElement("div");
    strip.className = "scw-community-links";
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", t("Label"));
    for (const link of LINKS) strip.append(CommunityLinks.#button(link, t));

    const note = document.createElement("p");
    note.className = "scw-community-note";
    for (const key of NOTE_LINES) {
      const line = document.createElement("span");
      line.textContent = t(key);
      note.append(line);
    }
    section.append(strip, note);
    return strip;
  }

  static #button(link, t) {
    const tooltip = t(`${link.id}.Tooltip`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scw-community-link scw-community-link--${link.id}`;
    button.dataset.tooltip = tooltip;
    button.setAttribute("aria-label", tooltip);
    const icon = document.createElement("i");
    icon.className = link.icon;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = t(`${link.id}.Label`);
    button.append(icon, label);
    button.addEventListener("click", (event) => {
      // The settings form owns the submit around it: opening a link must not save the sheet.
      event.preventDefault();
      event.stopPropagation();
      window.open(link.url, "_blank", "noopener");
    });
    return button;
  }

  /** Foundry draws one section per package: v13/v14 mark it with data-category (or data-tab). */
  static #moduleSection(html) {
    const root = html?.jquery ? html[0] : html;
    if (!root?.querySelector) return null;
    if (root.matches?.(`[data-category="${MODULE_ID}"]`)) return root;
    return root.querySelector(`[data-category="${MODULE_ID}"]`) ?? root.querySelector(`[data-tab="${MODULE_ID}"]`);
  }
}
