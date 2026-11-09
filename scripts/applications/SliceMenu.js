import { activeTheme, appearanceValues } from "../hooks/register-settings.js";
import WheelAppearance from "./WheelAppearance.js";

/** Keeps the menu this far from the screen's edges. */
const EDGE = 8;

/**
 * RF-122: the menu a right click opens on a slice or a phase member — what
 * this user may do with that combatant — in the wheel's theme. It lives on
 * the page, not in the widget, so no slice or clip cuts it. One at a time; a
 * click outside, Escape, Tab, the mouse wheel or picking an item closes it.
 * The arrows, Home and End move between the items; Escape and a pick give the
 * keyboard back to the portrait it was opened on.
 */
export default class SliceMenu {
  static #open = null;

  /**
   * @param {object} options
   * @param {number} options.x        viewport px
   * @param {number} options.y        viewport px
   * @param {string} options.title    whom the menu is about
   * @param {{icon: string, label: string, danger?: boolean, run: () => unknown}[]} options.items
   * @param {HTMLElement} [options.returnFocus]  where the keyboard goes back to on Escape
   * @returns {boolean} whether there was anything to offer
   */
  static open({ x, y, title, items, returnFocus = null }) {
    SliceMenu.close();
    if (!items.length) return false;
    const host = document.createElement("div");
    host.className = "sc-combat-wheel scw-slice-menu-host";
    const look = appearanceValues();
    WheelAppearance.applyLook(host, look, { orientation: "up", theme: activeTheme(look), expanded: false });

    const menu = document.createElement("div");
    menu.className = "scw-roll-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", title);
    // Focusable itself, so a click on its title is not read as focus leaving it.
    menu.tabIndex = -1;
    const kicker = document.createElement("span");
    kicker.className = "scw-details-kicker";
    kicker.textContent = title;
    menu.append(kicker);
    items.forEach((item, index) => {
      // What cannot be undone stands apart, after a rule.
      if (item.danger && index > 0 && !items[index - 1].danger) {
        const rule = document.createElement("hr");
        rule.className = "scw-menu-rule";
        menu.append(rule);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "scw-menu-item";
      button.classList.toggle("is-danger", Boolean(item.danger));
      button.setAttribute("role", "menuitem");
      const icon = document.createElement("i");
      icon.className = `fa-solid ${item.icon}`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = item.label;
      button.append(icon, label);
      button.addEventListener("click", () => {
        SliceMenu.close();
        returnFocus?.focus({ preventScroll: true });
        void item.run();
      });
      menu.append(button);
    });
    host.append(menu);
    document.body.append(host);
    host.style.left = `${Math.max(EDGE, Math.min(x, window.innerWidth - menu.offsetWidth - EDGE))}px`;
    host.style.top = `${Math.max(EDGE, Math.min(y, window.innerHeight - menu.offsetHeight - EDGE))}px`;

    const onPointer = (event) => {
      if (!menu.contains(event.target)) SliceMenu.close();
    };
    const buttons = [...menu.querySelectorAll("button")];
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        SliceMenu.close();
        returnFocus?.focus({ preventScroll: true });
        return;
      }
      const index = buttons.indexOf(document.activeElement);
      const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      buttons[(target + buttons.length) % buttons.length].focus();
    };
    // Tab, or anything else that takes the focus away, closes it.
    menu.addEventListener("focusout", (event) => {
      if (!menu.contains(event.relatedTarget)) SliceMenu.close();
    });
    const onWheel = () => SliceMenu.close();
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheel, { passive: true });
    SliceMenu.#open = {
      host,
      cleanup: () => {
        document.removeEventListener("pointerdown", onPointer, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("wheel", onWheel);
      },
    };
    buttons[0]?.focus();
    return true;
  }

  static close() {
    const open = SliceMenu.#open;
    if (!open) return;
    SliceMenu.#open = null;
    open.cleanup();
    open.host.remove();
  }
}
