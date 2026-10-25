import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STYLE_CHOICES, STYLE_PROPERTIES, styleOverrides } from "../scripts/helpers/theme-style.js";

describe("styleOverrides (RF-98)", () => {
  it("keeps the theme's own look for 'theme', unknown and missing values", () => {
    assert.deepEqual(styleOverrides({}), {});
    assert.deepEqual(styleOverrides(Object.fromEntries(Object.keys(STYLE_CHOICES).map((key) => [key, "theme"]))), {});
    assert.deepEqual(styleOverrides({ corners: "wobbly" }), {});
  });

  it("sets the font of names and titles, corners and rim", () => {
    const out = styleOverrides({ font: "display", corners: "sharp", rim: "thick" });
    assert.match(out["--scw-font-name"], /Modesto/);
    assert.equal(out["--scw-font-title"], out["--scw-font-name"]);
    assert.equal(out["--scw-radius"], "2px");
    assert.equal(out["--scw-rim-width"], "5px");
  });

  it("lists every property it can set", () => {
    const every = Object.fromEntries(Object.entries(STYLE_CHOICES).map(([key, choices]) => [key, choices.at(-1)]));
    const all = new Set();
    for (const [key, choices] of Object.entries(STYLE_CHOICES)) {
      for (const choice of choices) for (const property of Object.keys(styleOverrides({ ...every, [key]: choice }))) all.add(property);
    }
    for (const property of all) assert.ok(STYLE_PROPERTIES.includes(property), property);
  });
});
