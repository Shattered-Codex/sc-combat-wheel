import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORIENTATIONS,
  isSideOrientation,
  normalizeOrientation,
  oppositeOf,
  wheelRotation,
} from "../scripts/helpers/orientation.js";

describe("orientation (RF-13)", () => {
  it("falls back to up for unknown values", () => {
    assert.equal(normalizeOrientation("sideways"), "up");
    assert.equal(normalizeOrientation(undefined), "up");
    for (const orientation of ORIENTATIONS) assert.equal(normalizeOrientation(orientation), orientation);
  });

  it("turns the drawn wheel a quarter at a time", () => {
    assert.deepEqual(ORIENTATIONS.map(wheelRotation), [0, 90, 180, -90]);
  });

  it("puts the bar on the side away from the arc", () => {
    assert.deepEqual(ORIENTATIONS.map(oppositeOf), ["down", "left", "up", "right"]);
  });

  it("stands the bar up only for side arcs", () => {
    assert.deepEqual(ORIENTATIONS.filter(isSideOrientation), ["right", "left"]);
  });
});
