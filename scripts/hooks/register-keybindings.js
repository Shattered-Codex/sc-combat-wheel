import { I18N_ROOT, MODULE_ID } from "../constants/module-constants.js";

/** Keybindings have no default keys, so they never collide with the user's setup. */
export function registerKeybindings(watcher) {
  const register = (action, onDown, restricted = false) =>
    game.keybindings.register(MODULE_ID, action, {
      name: `${I18N_ROOT}.Keybindings.${action}`,
      editable: [],
      restricted,
      onDown: () => {
        onDown();
        return true;
      },
    });

  register("toggle", () => watcher.toggle());
  register("nextTurn", () => watcher.app?.nextTurn(), true);
  register("previousTurn", () => watcher.app?.previousTurn(), true);
  register("toggleLock", () => watcher.app?.toggleLock());
  register("seeAll", () => watcher.app?.toggleGrid());
  register("backToTurn", () => watcher.app?.backToTurn());
  register("resetPosition", () => void watcher.resetPosition());
}
