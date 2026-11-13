import assert from "node:assert/strict";
import { describe, it } from "node:test";
import WheelAppearance from "../scripts/applications/WheelAppearance.js";

describe("hit points numbers placement (#9)", () => {
  it("puts the numbers in the bar only when there is a bar: along the foot or the side band", () => {
    assert.equal(WheelAppearance.hpLabelPlacement({ hpLabelPlacement: "bar", hpOverlay: "bottom" }), "bar");
    assert.equal(WheelAppearance.hpLabelPlacement({ hpLabelPlacement: "bar", hpOverlay: "band" }), "bar");
    for (const hpOverlay of ["off", "drain", "fill"]) {
      assert.equal(WheelAppearance.hpLabelPlacement({ hpLabelPlacement: "bar", hpOverlay }), "bottom", hpOverlay);
    }
    assert.equal(WheelAppearance.hpLabelPlacement({ hpLabelPlacement: "bottom", hpOverlay: "bottom" }), "bottom");
    assert.equal(WheelAppearance.hpLabelPlacement({ hpLabelPlacement: "center", hpOverlay: "bottom" }), "center");
    assert.equal(WheelAppearance.hpLabelPlacement({ hpOverlay: "bottom" }), "bar", "the default");
  });
});
