import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isForward, soundEventFor } from "../scripts/helpers/turn-events.js";

const vm = (id, extra = {}) => ({ id, isOwner: false, virtual: false, ...extra });
const model = (round, turn, extra = {}) => ({ round, turn, activeHidden: false, current: vm("a"), nextUp: vm("b"), ...extra });

describe("isForward", () => {
  it("compares rounds first, then turns", () => {
    assert.equal(isForward({ round: 1, turn: 3 }, { round: 2, turn: 0 }), true);
    assert.equal(isForward({ round: 2, turn: 0 }, { round: 1, turn: 3 }), false);
    assert.equal(isForward({ round: 2, turn: 1 }, { round: 2, turn: 2 }), true);
    assert.equal(isForward({ round: 2, turn: 2 }, { round: 2, turn: 1 }), false);
  });
});

describe("soundEventFor (RF-50, RF-51, RF-54)", () => {
  const player = { isGM: false };
  const gm = { isGM: true };

  it("plays nothing when the turn did not change", () => {
    assert.equal(soundEventFor({ round: 2, turn: 1 }, model(2, 1), player), null);
    assert.equal(soundEventFor(null, model(2, 1), player), null);
  });

  it("marks the start of combat above everything else", () => {
    const owned = model(1, 0, { current: vm("a", { isOwner: true }) });
    assert.equal(soundEventFor({ round: 0, turn: 0 }, owned, player), "combatStart");
  });

  it("prefers the player's own turn, then being next", () => {
    assert.equal(soundEventFor({ round: 2, turn: 0 }, model(2, 1, { current: vm("a", { isOwner: true }) }), player), "ownTurn");
    assert.equal(soundEventFor({ round: 2, turn: 0 }, model(2, 1, { nextUp: vm("b", { isOwner: true }) }), player), "nextUp");
  });

  it("falls back to a new round, then any turn change", () => {
    assert.equal(soundEventFor({ round: 2, turn: 3 }, model(3, 0), player), "roundStart");
    assert.equal(soundEventFor({ round: 2, turn: 0 }, model(2, 1), player), "turnChange");
  });

  it("never plays own-turn or next-up sounds for the GM", () => {
    const owned = model(2, 1, { current: vm("a", { isOwner: true }), nextUp: vm("b", { isOwner: true }) });
    assert.equal(soundEventFor({ round: 2, turn: 0 }, owned, gm), "turnChange");
  });

  it("does not announce a hidden turn as the player's own", () => {
    const hidden = model(2, 1, { activeHidden: true, current: vm("a", { isOwner: true }) });
    assert.equal(soundEventFor({ round: 2, turn: 0 }, hidden, player), "turnChange");
  });
});

describe("soundEventFor going back (RF-101)", () => {
  const model = (round, turn) => ({ round, turn, current: { id: "a", isOwner: false }, nextUp: { id: "b", isOwner: false }, activeHidden: false });
  it("plays the turn-back sound only when it is set", () => {
    assert.equal(soundEventFor({ round: 2, turn: 3 }, model(2, 2), { isGM: true, turnBack: true }), "turnBack");
    assert.equal(soundEventFor({ round: 2, turn: 3 }, model(2, 2), { isGM: true }), "turnChange");
    assert.equal(soundEventFor({ round: 2, turn: 3 }, model(2, 4), { isGM: true, turnBack: true }), "turnChange");
  });
});
