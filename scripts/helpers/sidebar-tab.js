/** The core sidebar's combat tab (`ui.combat.tabName`). */
export const COMBAT_TAB = "combat";

/** How long after a press on a sidebar tab a change still counts as the user's own. */
export const USER_TAB_WINDOW_MS = 1000;

/**
 * #10: whether a change to `tab` must be undone, sending the sidebar back to
 * `previous`. Only the combat tab is held back, only when this browser asked
 * for it, and never right after the user pressed that very tab (`userTab`):
 * a press on another tab gives no leave to switch to combat.
 */
export function shouldUndoTabChange({ enabled, tab, previous, userTab, msSinceUserInput }) {
  if (!enabled || tab !== COMBAT_TAB) return false;
  if (!previous || previous === COMBAT_TAB) return false;
  return !(userTab === COMBAT_TAB && msSinceUserInput < USER_TAB_WINDOW_MS);
}

/**
 * Whether a waiting undo still applies when it runs: only while the combat
 * tab it was meant to undo is still the open one. Any later switch, the
 * user's or anyone's, wins.
 */
export function shouldRestoreTab({ activeTab }) {
  return activeTab === COMBAT_TAB;
}
