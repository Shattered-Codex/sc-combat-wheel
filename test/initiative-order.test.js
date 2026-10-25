import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initiativeBetween, initiativeForMove } from "../scripts/helpers/initiative-order.js";

describe("initiativeBetween (RF-33, RF-69)", () => {
  it("lands halfway between neighbours", () => {
    assert.equal(initiativeBetween(20, 10), 15);
    assert.equal(initiativeBetween(12, 11), 11.5);
  });

  it("goes above the first and below the last", () => {
    assert.equal(initiativeBetween(null, 18), 19);
    assert.equal(initiativeBetween(4, null), 3);
    assert.equal(initiativeBetween(null, null), 20);
  });

  it("keeps ties instead of inventing an order", () => {
    assert.equal(initiativeBetween(15, 15), 15);
  });
});

describe("initiativeForMove", () => {
  const ring = [21, 17, 12, 8];

  it("moves a combatant down, between its new neighbours", () => {
    assert.equal(initiativeForMove(ring, 0, 3), 10);
  });

  it("moves a combatant up to the top", () => {
    assert.equal(initiativeForMove(ring, 3, 0), 22);
  });

  it("moves to the very end", () => {
    assert.equal(initiativeForMove(ring, 1, 4), 7);
  });
});
