import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: TurnAutomation } = await import("../scripts/services/TurnAutomation.js");

/** A combat whose `nextTurn()` is counted; `game.combats.get` finds it. */
function liveCombat(id) {
  const combat = { id, round: 2, turn: 1, combatant: { id: "virtual" }, turns: [{}, {}, {}], advances: 0, nextTurn() { this.advances += 1; } };
  game.combats = { get: (wanted) => (wanted === id ? combat : undefined) };
  return combat;
}

describe("TurnAutomation (RF-46, RF-65)", () => {
  it("advances from the same combatant and round only", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const combat = liveCombat("c-round");
    TurnAutomation.advance(combat, "virtual", 800);
    // The GM goes back a round before the pause ends: the same position, an earlier round.
    combat.round = 1;
    t.mock.timers.tick(800);
    assert.equal(combat.advances, 0);
    TurnAutomation.settle(combat);
  });

  it("drops a waiting advance once a turn stays (settle)", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const combat = liveCombat("c-settle");
    TurnAutomation.advance(combat, "virtual", 800);
    // On to a living combatant, then back onto the position before the pause ends.
    TurnAutomation.settle(combat);
    t.mock.timers.tick(800);
    assert.equal(combat.advances, 0);
  });

  it("does not advance a position left and entered again before the pause ends", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const combat = liveCombat("c-revisit");
    TurnAutomation.advance(combat, "virtual", 800);
    // On to the next combatant and back: the same combatant and round, another entry.
    TurnAutomation.noteTurnChange(combat, { round: 2, turn: 0 });
    TurnAutomation.noteTurnChange(combat, { round: 2, turn: 2 });
    t.mock.timers.tick(800);
    assert.equal(combat.advances, 0);
    TurnAutomation.settle(combat);
  });

  it("counts only the advances that happened towards the loop guard", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const combat = liveCombat("c-chain");
    const warnings = [];
    ui.notifications = { warn: (message) => warnings.push(message) };
    // The GM enters the position and goes back, again and again, before it ever advances.
    for (let lap = 0; lap < 10; lap++) {
      TurnAutomation.noteTurnChange(combat, { round: 2, turn: 0 });
      assert.equal(TurnAutomation.advance(combat, "virtual", 800), true);
      TurnAutomation.noteTurnChange(combat, { round: 2, turn: 2 });
      t.mock.timers.tick(800);
    }
    assert.deepEqual(warnings, []);
    assert.equal(combat.advances, 0);
  });

  it("keeps one pending advance per combat", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const combat = liveCombat("c-once");
    TurnAutomation.advance(combat, "virtual", 800);
    // Back a turn and forward again: the position schedules its advance a second time.
    TurnAutomation.advance(combat, "virtual", 800);
    t.mock.timers.tick(800);
    assert.equal(combat.advances, 1);
    TurnAutomation.settle(combat);
  });
});
