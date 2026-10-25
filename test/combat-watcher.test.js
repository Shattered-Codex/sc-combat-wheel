import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { installFoundryStubs, registered } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: CombatWatcher } = await import("../scripts/services/CombatWatcher.js");

/** Stands in for CombatWheelApp: records what the watcher asked of it. */
function fakeApp({ visible = true } = {}) {
  return {
    rendered: false,
    combatId: null,
    renders: [],
    closed: 0,
    hasVisibleCombatants: () => visible,
    get isOpen() {
      return this.rendered;
    },
    render(options) {
      this.rendered = true;
      this.combatId = game.combat?.id ?? null;
      this.renders.push(options);
    },
    close() {
      this.rendered = false;
      this.closed += 1;
    },
    refreshCombat() {},
  };
}

const fire = (hook, ...args) => {
  for (const fn of registered.on.get(hook) ?? []) fn(...args);
};

function setup({ round = 0, openOnStart = true, visible = true } = {}) {
  registered.on.clear();
  const combat = { id: "c1", round, started: round > 0, combatants: [], turns: [] };
  game.combat = combat;
  game.combats = [combat];
  game.settings.get = (module, key) => (key === "openOnStart" ? openOnStart : undefined);
  const app = fakeApp({ visible });
  const turns = [];
  const watcher = new CombatWatcher({ createApp: () => app, onTurnChanged: (c, previous) => turns.push(previous) });
  watcher.start();
  return { combat, app, watcher, turns };
}

describe("CombatWatcher — the wheel appears when combat starts (RF-00)", () => {
  beforeEach(() => registered.on.clear());

  it("opens on every client when the round goes from 0 to 1", () => {
    const { combat, app } = setup();
    assert.equal(app.renders.length, 0, "nothing before the start");
    combat.round = 1;
    combat.started = true;
    fire("updateCombat", combat, { round: 1, turn: 0 });
    assert.equal(app.renders.length, 1);
    assert.equal(app.renders[0].force, true);
  });

  it("opens on load when the combat is already running", () => {
    const { app } = setup({ round: 3 });
    assert.equal(app.renders.length, 1);
  });

  it("does not reopen on later rounds after the user closed it", () => {
    const { combat, app } = setup({ round: 1 });
    app.close();
    combat.round = 2;
    fire("updateCombat", combat, { round: 2, turn: 0 });
    assert.equal(app.renders.length, 1, "only the load-time open");
  });

  it("respects the openOnStart setting", () => {
    const { combat, app } = setup({ openOnStart: false });
    combat.round = 1;
    fire("updateCombat", combat, { round: 1, turn: 0 });
    assert.equal(app.renders.length, 0);
  });

  it("skips players who cannot see any combatant", () => {
    const { combat, app } = setup({ visible: false });
    combat.round = 1;
    fire("updateCombat", combat, { round: 1, turn: 0 });
    assert.equal(app.renders.length, 0);
  });

  it("reports real turn changes with the position they came from", () => {
    const { combat, turns } = setup({ round: 1 });
    combat.turn = 1;
    fire("updateCombat", combat, { turn: 1 });
    fire("updateCombat", combat, { name: "renamed" });
    assert.deepEqual(turns, [{ round: 1, turn: null, combatantId: null }]);
  });

  it("reads the next turn against the index a new initiative moved the acting combatant to", async () => {
    const { combat, turns } = setup({ round: 1 });
    combat.turn = 2;
    combat.combatant = { id: "a" };
    fire("updateCombat", combat, { turn: 2 });
    turns.length = 0;
    // A lower initiative sorts the acting combatant one place up: no updateCombat, no turn change.
    combat.turn = 1;
    fire("updateCombatant", { parent: combat }, { initiative: 18 });
    await Promise.resolve();
    assert.deepEqual(turns, []);
    combat.turn = 2;
    combat.combatant = { id: "b" };
    fire("updateCombat", combat, { turn: 2 });
    assert.deepEqual(turns, [{ round: 1, turn: 1, combatantId: "a" }]);
  });

  it("takes a re-sort of the acting combatant for no turn change (resetAll)", () => {
    const { combat, turns } = setup({ round: 1 });
    combat.turn = 2;
    combat.combatant = { id: "a" };
    fire("updateCombat", combat, { turn: 2 });
    turns.length = 0;
    combat.turn = 0;
    fire("updateCombat", combat, { turn: 0, combatants: [] }, { turnEvents: false });
    assert.deepEqual(turns, []);
  });

  it("reports the successor's turn when the acting combatant is deleted, and nothing for other roster changes", async () => {
    const { combat, turns } = setup({ round: 1 });
    combat.turn = 1;
    combat.combatant = { id: "a" };
    fire("updateCombat", combat, { turn: 1 });
    turns.length = 0;
    // Someone joins before the acting combatant: the index shifts, the turn stays its.
    combat.turn = 2;
    fire("createCombatant", { parent: combat });
    await Promise.resolve();
    assert.deepEqual(turns, []);
    // The acting combatant leaves: the successor takes the same index, with no updateCombat.
    combat.combatant = { id: "b" };
    fire("deleteCombatant", { parent: combat });
    await Promise.resolve();
    assert.deepEqual(turns, [{ round: 1, turn: 1 }]);
  });

  it("closes when the displayed combat is deleted", () => {
    const { combat, app } = setup({ round: 1 });
    fire("deleteCombat", combat);
    assert.equal(app.closed, 1);
  });
});
