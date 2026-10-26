import { I18N_ROOT } from "../constants/module-constants.js";
import { contextMenuEntry } from "../helpers/context-menu-entry.js";
import StylePicker from "../services/StylePicker.js";

/**
 * The combat tracker's options menu (the "⋮" by the round), which Foundry only
 * builds for the GM: the quick change between saved styles (RF-110), and
 * "Reset wheel position" (RF-105), so a wheel dragged out of reach comes back
 * from a place that is always on screen. Players have the settings screen's
 * button and the shortcut.
 */
export function registerTrackerMenu(watcher) {
  Hooks.on("getCombatContextOptions", (application, entries) => {
    entries.push(contextMenuEntry({
      label: `${I18N_ROOT}.CombatStyles.Choose`,
      icon: "fa-solid fa-swatchbook",
      visible: () => true,
      onClick: () => StylePicker.choose(),
    }, game.release.generation));
    entries.push(contextMenuEntry({
      label: `${I18N_ROOT}.SettingsMenu.ResetPosition.Menu`,
      icon: "fa-solid fa-arrows-to-dot",
      visible: () => true,
      onClick: async () => {
        await watcher.resetPosition();
        ui.notifications.info(`${I18N_ROOT}.Notifications.PositionReset`, { localize: true });
      },
    }, game.release.generation));
  });
}
