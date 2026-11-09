import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLOR_KEYS, OVERRIDE_PROPERTIES, colorOverrides, isHexColor } from "../scripts/helpers/theme-colors.js";

describe("isHexColor", () => {
  it("accepts #rrggbb in either case and nothing else", () => {
    assert.equal(isHexColor("#a1B2c3"), true);
    for (const value of ["", "#abc", "a1b2c3", "#a1b2c3ff", "#ggg000", "red", null, undefined, 123]) {
      assert.equal(isHexColor(value), false, String(value));
    }
  });
});

describe("colorOverrides", () => {
  it("sets nothing when every color is empty or missing", () => {
    assert.deepEqual(colorOverrides({}), {});
    assert.deepEqual(colorOverrides(undefined), {});
    assert.deepEqual(colorOverrides(Object.fromEntries(COLOR_KEYS.map((key) => [key, ""]))), {});
  });

  it("derives the accent ramp, the HP fill and the primary button from the accent", () => {
    const vars = colorOverrides({ accent: "#3366CC" });
    assert.equal(vars["--scw-accent"], "#3366cc");
    for (const step of [100, 200, 300, 400]) assert.match(vars[`--scw-accent-${step}`], /^color-mix\(in srgb, #3366cc \d+%, white\)$/);
    for (const step of [700, 800, 900]) assert.match(vars[`--scw-accent-${step}`], /^color-mix\(in srgb, #3366cc \d+%, black\)$/);
    assert.ok(vars["--scw-hp-fill"].includes("#3366cc"));
    assert.equal(vars["--scw-btn-primary-text"], "#3366cc");
    assert.equal(vars["--scw-btn-primary-border"], "#3366cc");
    assert.equal(vars["--scw-text"], undefined);
  });

  it("maps the other colors to their roles", () => {
    const vars = colorOverrides({ background: "#101010", text: "#eeeeee", hostile: "#ff0000", active: "#00ff00" });
    assert.equal(vars["--scw-bg"], "#101010");
    assert.equal(vars["--scw-text"], "#eeeeee");
    assert.ok(vars["--scw-text-muted"].includes("#eeeeee"));
    assert.equal(vars["--scw-hostile"], "#ff0000");
    assert.equal(vars["--scw-active"], "#00ff00");
    // The glow follows the acting colour through the shared recipe (RF-114).
    assert.ok(vars["--scw-active-glow"].includes("var(--scw-active)"));
  });

  it("ignores invalid values and unknown keys", () => {
    assert.deepEqual(colorOverrides({ accent: "blue", text: "#12345", surface: "#xyzxyz", border: "#123456" }), {});
    assert.deepEqual(Object.keys(colorOverrides({ accent: "nope", secret: "#123456" })), ["--scw-secret"]);
  });

  it("lists every property a full input can set", () => {
    const vars = colorOverrides(Object.fromEntries(COLOR_KEYS.map((key) => [key, "#808080"])));
    assert.deepEqual(new Set(Object.keys(vars)), new Set(OVERRIDE_PROPERTIES));
    assert.equal(new Set(OVERRIDE_PROPERTIES).size, OVERRIDE_PROPERTIES.length);
    assert.ok(Object.isFrozen(OVERRIDE_PROPERTIES));
  });
});
