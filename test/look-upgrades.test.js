import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upgradeLook } from "../scripts/helpers/look-upgrades.js";

describe("upgradeLook (RF-111)", () => {
  it("turns the Squares layout into the compact one with square portraits", () => {
    assert.deepEqual(upgradeLook({ layoutPreset: "squares", portraitShape: "sector", theme: "royal" }), { layoutPreset: "compact", portraitShape: "square", theme: "royal" });
  });

  it("moves the old tools column into the More menu", () => {
    assert.equal(upgradeLook({ barControls: "column" }).barControls, "menu");
    assert.equal(upgradeLook({ barControls: "inline" }).barControls, "inline");
  });

  it("moves a theme that was folded into another to its neighbour (RF-115)", () => {
    assert.equal(upgradeLook({ theme: "slate" }).theme, "graphite");
    assert.equal(upgradeLook({ theme: "linen" }).theme, "paper");
    assert.equal(upgradeLook({ theme: "royal" }).theme, "royal");
  });

  it("leaves today's values alone and never changes what it is given", () => {
    const look = { layoutPreset: "squares" };
    upgradeLook(look);
    assert.equal(look.layoutPreset, "squares");
    assert.deepEqual(upgradeLook({ layoutPreset: "dense" }), { layoutPreset: "dense" });
    assert.equal(upgradeLook(null), null);
  });
});

describe("withdrawn options", () => {
  it("draws a look saved with the arc bar with the straight bar", () => {
    assert.equal(upgradeLook({ barLayout: "arc" }).barLayout, "bar");
    assert.equal(upgradeLook({ barLayout: "split" }).barLayout, "split");
  });
});
