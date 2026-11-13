import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { USER_TAB_WINDOW_MS, shouldRestoreTab, shouldUndoTabChange } from "../scripts/helpers/sidebar-tab.js";

describe("staying on the sidebar tab (#10)", () => {
  const change = { enabled: true, tab: "combat", previous: "chat", msSinceUserInput: Number.POSITIVE_INFINITY };

  it("undoes a switch to the combat tab nobody clicked", () => {
    assert.equal(shouldUndoTabChange(change), true);
  });

  it("lets the user's own click on the combat tab through", () => {
    assert.equal(shouldUndoTabChange({ ...change, userTab: "combat", msSinceUserInput: 20 }), false);
    assert.equal(shouldUndoTabChange({ ...change, userTab: "combat", msSinceUserInput: USER_TAB_WINDOW_MS + 1 }), true);
  });

  it("gives no leave when the press was on another tab", () => {
    assert.equal(shouldUndoTabChange({ ...change, userTab: "chat", msSinceUserInput: 20 }), true);
    assert.equal(shouldUndoTabChange({ ...change, userTab: null, msSinceUserInput: 20 }), true);
  });

  it("drops a waiting undo once another tab was opened meanwhile", () => {
    assert.equal(shouldRestoreTab({ activeTab: "combat" }), true);
    assert.equal(shouldRestoreTab({ activeTab: "actors" }), false);
    assert.equal(shouldRestoreTab({ activeTab: "chat" }), false);
  });

  it("restores Foundry's behaviour when off, and never touches other tabs", () => {
    assert.equal(shouldUndoTabChange({ ...change, enabled: false }), false);
    assert.equal(shouldUndoTabChange({ ...change, tab: "chat", previous: "combat" }), false);
    assert.equal(shouldUndoTabChange({ ...change, tab: "actors" }), false);
  });

  it("has nothing to go back to when the combat tab was already open, or nothing was", () => {
    assert.equal(shouldUndoTabChange({ ...change, previous: "combat" }), false);
    assert.equal(shouldUndoTabChange({ ...change, previous: null }), false);
  });
});
