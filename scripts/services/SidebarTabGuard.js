import { SETTINGS } from "../constants/module-constants.js";
import { getSetting } from "../hooks/register-settings.js";
import { shouldRestoreTab, shouldUndoTabChange } from "../helpers/sidebar-tab.js";

/**
 * #10: keeps the sidebar on the tab this user had open when something other
 * than their own click switches it to the combat tab — a system or a module
 * as a combat starts (Foundry's core does not switch by itself in v13/v14).
 * Every switch goes through `Sidebar#changeTab`, which calls the
 * `changeSidebarTab` hook in both versions; a switch that `SidebarTab#activate`
 * started also opens a collapsed sidebar, so it is folded back too. The
 * pop-out tracker is never touched, and a click on the combat tab always works.
 */
export default class SidebarTabGuard {
  /** The tab to come back to: the last one opened other than an undone combat tab. */
  static #previous = null;
  /** The tab the user last pressed, and when. */
  static #userTab = null;
  static #userInputAt = Number.NEGATIVE_INFINITY;
  /** True only while the guard's own changeTab runs, so its hook is not taken for another switch. */
  static #restoring = false;

  static install() {
    for (const type of ["pointerdown", "keydown"]) {
      document.addEventListener(type, (event) => SidebarTabGuard.#noteUserInput(event), { capture: true });
    }
    Hooks.on("changeSidebarTab", (application) => SidebarTabGuard.#onChange(application));
  }

  /** Once the sidebar is drawn (ready): the tab to come back to until the user picks another. */
  static start() {
    SidebarTabGuard.#previous ??= ui.sidebar?.tabGroups?.primary ?? null;
  }

  static #noteUserInput(event) {
    const button = event.target?.closest?.("#sidebar-tabs [data-tab]");
    if (!button) return;
    SidebarTabGuard.#userTab = button.dataset.tab ?? null;
    SidebarTabGuard.#userInputAt = performance.now();
  }

  static #onChange(application) {
    if (SidebarTabGuard.#restoring) return;
    const tab = application?.tabName ?? ui.sidebar?.tabGroups?.primary ?? null;
    const previous = SidebarTabGuard.#previous;
    const undo = shouldUndoTabChange({
      enabled: getSetting(SETTINGS.keepSidebarTab),
      tab,
      previous,
      userTab: SidebarTabGuard.#userTab,
      msSinceUserInput: performance.now() - SidebarTabGuard.#userInputAt,
    });
    if (!undo) {
      SidebarTabGuard.#previous = tab;
      return;
    }
    // The hook runs inside changeTab, before activate() expands the sidebar: undo once both are done,
    // and only if nothing opened another tab meanwhile (that switch, recorded above, wins).
    const wasExpanded = Boolean(ui.sidebar?.expanded);
    setTimeout(() => {
      if (!shouldRestoreTab({ activeTab: ui.sidebar?.tabGroups?.primary })) return;
      SidebarTabGuard.#restoring = true;
      try {
        ui.sidebar.changeTab(SidebarTabGuard.#previous ?? previous, "primary");
        if (!wasExpanded && ui.sidebar.expanded) ui.sidebar.collapse();
      } finally {
        SidebarTabGuard.#restoring = false;
      }
    }, 0);
  }
}
