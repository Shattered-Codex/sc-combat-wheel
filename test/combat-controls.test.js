import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: CombatControls } = await import("../scripts/services/CombatControls.js");

describe("CombatControls.endOwnTurn", () => {
  const combatOf = (isOwner) => ({ combatant: { isOwner }, advances: 0, nextTurn() { this.advances += 1; } });
  const warnings = [];
  ui.notifications = { warn: (message) => warnings.push(message) };

  it("ends the turn while the acting combatant is still the user's", () => {
    const combat = combatOf(true);
    CombatControls.endOwnTurn(combat, { canEndOwnTurn: true });
    assert.equal(combat.advances, 1);
  });

  it("refuses when the turn moved to someone else before the wheel was redrawn", () => {
    const combat = combatOf(false);
    CombatControls.endOwnTurn(combat, { canEndOwnTurn: true });
    assert.equal(combat.advances, 0);
    assert.equal(warnings.length, 1);
  });

  it("leaves a phased combat to Venaerys, which marks the user's own done", () => {
    const combat = combatOf(false);
    CombatControls.endOwnTurn(combat, { canEndOwnTurn: true, phased: true });
    assert.equal(combat.advances, 1);
  });
});
