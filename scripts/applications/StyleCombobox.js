import { filterStyleOptions } from "../helpers/combat-styles.js";

const escape = (text) => foundry.utils.escapeHTML(String(text ?? ""));

/**
 * RF-108: a text field that suggests combat styles as you type (an ARIA
 * combobox with a list). The chosen style's id goes in a hidden input named
 * `name`, so a dialog's form reads it like any field. Arrows move through the
 * suggestions, Enter picks one, Escape closes them without closing the dialog;
 * with the list closed, Enter submits as usual.
 */
export default class StyleCombobox {
  #root;
  #input;
  #hidden;
  #list;
  #swatch;
  #options;
  #shown = [];
  #active = -1;

  /**
   * The markup to put in a form; bind() it once it is in the page.
   * @param {object} options
   * @param {string} options.name      the hidden input's name
   * @param {string} options.label
   * @param {{ id: string, name: string, theme?: string, meta?: string }[]} options.options
   * @param {string} options.selected  the id chosen at first
   */
  static html({ name, label, options, selected }) {
    const chosen = options.find((option) => option.id === selected) ?? options[0];
    return `
      <div class="scw-combobox" data-style-combobox>
        <label class="scw-combobox__label" for="scw-combobox-input">${escape(label)}</label>
        <div class="scw-combobox__field">
          <span class="sc-combat-wheel scw-theme-swatch" data-combobox-swatch ${chosen?.theme ? `data-scw-theme="${escape(chosen.theme)}"` : "hidden"}></span>
          <input id="scw-combobox-input" type="text" role="combobox" autocomplete="off" spellcheck="false"
                 aria-autocomplete="list" aria-expanded="false" aria-controls="scw-combobox-list" value="${escape(chosen?.name)}">
          <i class="fa-solid fa-chevron-down scw-combobox__chevron" aria-hidden="true"></i>
        </div>
        <ul class="scw-combobox__list" id="scw-combobox-list" role="listbox" aria-label="${escape(label)}" hidden></ul>
        <input type="hidden" name="${escape(name)}" value="${escape(chosen?.id)}">
      </div>`;
  }

  /** Wires the combobox found in `container` to `options` (the same list given to html()). */
  static bind(container, options) {
    const root = container.querySelector("[data-style-combobox]");
    // A dialog may render again: its field keeps the listeners it already has.
    if (!root || root.dataset.bound) return null;
    root.dataset.bound = "1";
    return new StyleCombobox(root, options);
  }

  constructor(root, options) {
    this.#root = root;
    this.#options = options;
    this.#input = root.querySelector('[role="combobox"]');
    this.#hidden = root.querySelector('input[type="hidden"]');
    this.#list = root.querySelector('[role="listbox"]');
    this.#swatch = root.querySelector("[data-combobox-swatch]");
    this.#input.addEventListener("focus", () => this.#open(""));
    this.#input.addEventListener("click", () => this.#open(""));
    this.#input.addEventListener("input", () => this.#open(this.#input.value));
    this.#input.addEventListener("keydown", (event) => this.#onKeydown(event));
    this.#input.addEventListener("blur", () => setTimeout(() => this.#close(), 120));
    // A press on a suggestion picks it before the field's blur closes the list.
    this.#list.addEventListener("pointerdown", (event) => {
      const item = event.target.closest('[role="option"]');
      if (!item) return;
      event.preventDefault();
      this.#pick(this.#options.find((option) => option.id === item.dataset.id));
    });
  }

  #open(query) {
    this.#shown = filterStyleOptions(this.#options, query);
    const current = this.#hidden.value;
    this.#active = query ? (this.#shown.length ? 0 : -1) : this.#shown.findIndex((option) => option.id === current);
    this.#list.innerHTML = this.#shown.length
      ? this.#shown.map((option, index) => `
          <li role="option" id="scw-combobox-option-${index}" data-id="${escape(option.id)}"
              aria-selected="${option.id === current}" class="scw-combobox__option">
            <span class="sc-combat-wheel scw-theme-swatch" ${option.theme ? `data-scw-theme="${escape(option.theme)}"` : "data-empty"}></span>
            <span class="scw-combobox__name">${escape(option.name)}</span>
            ${option.meta ? `<span class="scw-combobox__meta">${escape(option.meta)}</span>` : ""}
          </li>`).join("")
      : `<li class="scw-combobox__empty" role="presentation">${escape(this.#root.dataset.empty ?? "—")}</li>`;
    this.#list.hidden = false;
    this.#input.setAttribute("aria-expanded", "true");
    this.#highlight();
  }

  #close() {
    if (this.#list.hidden) return;
    this.#list.hidden = true;
    this.#input.setAttribute("aria-expanded", "false");
    this.#input.removeAttribute("aria-activedescendant");
    // Text that names no style goes back to the chosen one.
    const chosen = this.#options.find((option) => option.id === this.#hidden.value);
    if (chosen) this.#input.value = chosen.name;
  }

  #pick(option) {
    if (!option) return;
    this.#hidden.value = option.id;
    this.#input.value = option.name;
    if (this.#swatch) {
      this.#swatch.hidden = !option.theme;
      if (option.theme) this.#swatch.dataset.scwTheme = option.theme;
    }
    this.#close();
  }

  #highlight() {
    const items = [...this.#list.querySelectorAll('[role="option"]')];
    items.forEach((item, index) => item.classList.toggle("is-active", index === this.#active));
    const item = items[this.#active];
    if (item) {
      this.#input.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView({ block: "nearest" });
    } else this.#input.removeAttribute("aria-activedescendant");
  }

  #onKeydown(event) {
    const open = !this.#list.hidden;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return this.#open("");
      if (!this.#shown.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      this.#active = (this.#active + step + this.#shown.length) % this.#shown.length;
      this.#highlight();
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      this.#pick(this.#shown[this.#active] ?? this.#shown[0]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      this.#close();
    }
  }
}
