import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAMERA_PANS, panDuration } from "../scripts/helpers/camera-pan.js";

describe("camera pan (RF-109)", () => {
  it("takes longer the farther the token, within the pace's bounds", () => {
    assert.equal(panDuration(0, "smooth"), CAMERA_PANS.smooth.min);
    assert.equal(panDuration(1200, "smooth"), 800);
    assert.equal(panDuration(100000, "smooth"), CAMERA_PANS.smooth.max);
  });

  it("is quicker when fast and slower when slow, and smooth for anything unknown", () => {
    assert.ok(panDuration(1500, "fast") < panDuration(1500, "smooth"));
    assert.ok(panDuration(1500, "slow") > panDuration(1500, "smooth"));
    assert.equal(panDuration(1500, "nope"), panDuration(1500, "smooth"));
    assert.equal(panDuration(Number.NaN, "fast"), CAMERA_PANS.fast.min);
  });
});
