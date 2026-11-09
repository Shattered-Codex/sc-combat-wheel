import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initiativeAtSlot, initiativeBetween, initiativeForMove, landingSlot, lastReachableSlot } from "../scripts/helpers/initiative-order.js";

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

  it("lands before those without initiative when dropped among them", () => {
    assert.equal(initiativeForMove([21, 17, null, null], 0, 4), 16);
  });
});

describe("initiativeAtSlot (RF-69)", () => {
  // Aoth 21, Baboon 20.5, two virtual positions at 20, Beiro without initiative.
  const ring = [21, 20.5, 20, 20, null];

  it("puts the last '+' after the last rolled one, not back at the default 20", () => {
    assert.equal(initiativeAtSlot(ring, 5), 19);
  });

  it("still lands between rolled neighbours, and at the top", () => {
    assert.equal(initiativeAtSlot(ring, 2), 20.25);
    assert.equal(initiativeAtSlot(ring, 0), 22);
  });

  it("keeps the default when nobody has rolled yet", () => {
    assert.equal(initiativeAtSlot([null, null], 1), 20);
  });
});

describe("where a new or dragged position really lands", () => {
  const ring = [21, 20.5, 20, 20, null];

  it("offers no slot after those without initiative", () => {
    assert.equal(lastReachableSlot(ring), 4);
    assert.equal(lastReachableSlot([21, 17]), 2, "the very end once everyone rolled");
    assert.equal(lastReachableSlot([null, null]), 0);
    assert.equal(landingSlot(ring, 5), 4);
    assert.equal(landingSlot(ring, 2), 2);
  });

  it("drops a dragged one just before those without initiative, in the same numbering", () => {
    assert.equal(landingSlot(ring, 5, 0), 4, "Aoth dragged to the end lands before Beiro");
    assert.equal(initiativeForMove(ring, 0, 4), 19);
    assert.equal(landingSlot([21, 17, 12], 3, 0), 3, "the very end once everyone rolled");
    assert.equal(landingSlot(ring, 1, 4), 1, "one without initiative still moves up");
  });
});
