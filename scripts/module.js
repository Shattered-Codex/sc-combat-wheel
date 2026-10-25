import { I18N_ROOT, MODULE_ID } from "./constants/module-constants.js";
import { registerKeybindings } from "./hooks/register-keybindings.js";
import { registerTrackerMenu } from "./hooks/register-tracker-menu.js";
import { migrateBrowserAppearance, registerSettings } from "./hooks/register-settings.js";
import CombatWheelAppearanceApp from "./applications/CombatWheelAppearanceApp.js";
import CombatWheelSettingsApp from "./applications/CombatWheelSettingsApp.js";
import CombatWatcher from "./services/CombatWatcher.js";
import CombatStylePicker from "./services/CombatStylePicker.js";
import StyleLoader from "./services/StyleLoader.js";

const watcher = new CombatWatcher();

Hooks.once("init", () => {
  StyleLoader.install();
  registerSettings({
    onLayoutChange: () => watcher.relayout(),
    onDataChange: () => watcher.scheduleRefresh(),
    SettingsMenu: CombatWheelSettingsApp,
    AppearanceMenu: CombatWheelAppearanceApp,
  });
  registerKeybindings(watcher);
  registerTrackerMenu(watcher);
});

// RF-108: the GM who starts a combat picks its style; only their client runs combatStart.
Hooks.on("combatStart", (combat) => void CombatStylePicker.onCombatStart(combat));

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: () => watcher.open(),
    close: () => watcher.close(),
    toggle: () => watcher.toggle(),
    openSettings: (tab) => CombatWheelSettingsApp.open(tab),
    openAppearance: () => CombatWheelAppearanceApp.open(),
    resetPosition: () => watcher.resetPosition(),
    chooseCombatStyle: (combat) => CombatStylePicker.choose(combat),
    get app() {
      return watcher.app;
    },
  };
  watcher.start();
  migrateBrowserAppearance().catch((error) => console.error(`${MODULE_ID} | appearance migration failed`, error));
});

/** v13+ scene controls are keyed objects; the button lives in the token tools. */
Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  tokens.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: `${I18N_ROOT}.Controls.Toggle`,
    icon: "fa-solid fa-dharmachakra",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => watcher.toggle(),
  };
  // RF-110: the GM changes the current combat's style from here too, whatever other modules do to the tracker.
  tokens.tools[`${MODULE_ID}-combat-style`] = {
    name: `${MODULE_ID}-combat-style`,
    title: `${I18N_ROOT}.CombatStyles.Choose`,
    icon: "fa-solid fa-swatchbook",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => CombatStylePicker.choose(),
  };
  // RF-105: always on screen, for the GM and players alike, even when other modules rework the tracker's menu.
  tokens.tools[`${MODULE_ID}-reset-position`] = {
    name: `${MODULE_ID}-reset-position`,
    title: `${I18N_ROOT}.SettingsMenu.ResetPosition.Menu`,
    icon: "fa-solid fa-arrows-to-dot",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: async () => {
      await watcher.resetPosition();
      ui.notifications.info(`${I18N_ROOT}.Notifications.PositionReset`, { localize: true });
    },
  };
});
