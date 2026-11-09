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

describe("CombatControls.startCombat", () => {
  const combatOf = (started) => ({ started, starts: 0, startCombat() { this.starts += 1; } });

  it("starts a combat still being set up, for the GM only", () => {
    const combat = combatOf(false);
    CombatControls.startCombat(combat);
    assert.equal(combat.starts, 1);
    game.user.isGM = false;
    try {
      CombatControls.startCombat(combat);
    } finally {
      game.user.isGM = true;
    }
    assert.equal(combat.starts, 1);
  });

  it("does nothing once the combat started", () => {
    const combat = combatOf(true);
    CombatControls.startCombat(combat);
    assert.equal(combat.starts, 0);
  });
});

describe("CombatControls on one combatant (RF-122)", () => {
  const combatWith = (combatant) => ({ combatants: new Map([["a", combatant]]) });
  const asPlayer = (run) => {
    game.user.isGM = false;
    try {
      run();
    } finally {
      game.user.isGM = true;
    }
  };

  it("lets only the GM take a combatant out of the combat", async () => {
    let deleted = 0;
    const combat = combatWith({ delete: async () => (deleted += 1) });
    await CombatControls.removeCombatant(combat, "a");
    asPlayer(() => CombatControls.removeCombatant(combat, "a"));
    assert.equal(deleted, 1);
    assert.equal(CombatControls.removeCombatant(combat, "gone"), null);
  });

  it("offers to clear movement only to the GM, and only once the token moved", () => {
    const moved = { clearMovementHistory() {}, token: { movementHistory: [{ x: 0, y: 0 }] } };
    assert.equal(CombatControls.canClearMovement(moved), true);
    assert.equal(CombatControls.canClearMovement({ ...moved, token: { movementHistory: [] } }), false, "nothing to clear");
    assert.equal(CombatControls.canClearMovement({ token: { movementHistory: [{}] } }), false, "no way to clear it here");
    asPlayer(() => assert.equal(CombatControls.canClearMovement(moved), false));
  });

  it("clears through the combatant, or else its token", () => {
    const cleared = [];
    CombatControls.clearMovement(combatWith({ clearMovementHistory: () => cleared.push("combatant") }), "a");
    CombatControls.clearMovement(combatWith({ token: { clearMovementHistory: () => cleared.push("token") } }), "a");
    asPlayer(() => CombatControls.clearMovement(combatWith({ clearMovementHistory: () => cleared.push("player") }), "a"));
    assert.deepEqual(cleared, ["combatant", "token"]);
  });
});
