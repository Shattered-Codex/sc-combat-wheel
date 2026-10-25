import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrastRatio, hexToRgb, paletteFromColor, parseCssColor } from "../scripts/helpers/palette.js";

describe("palette from one colour (RF-115)", () => {
  it("measures contrast the WCAG way", () => {
    assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 1e-9);
    assert.equal(contrastRatio("#777777", "#777777"), 1);
  });

  for (const seed of ["#9184d9", "#e0b84f", "#1a1a1a", "#ffffff", "#00ff88", "#c0283a"]) {
    for (const mode of ["dark", "light"]) {
      it(`keeps ${seed} readable on a ${mode} palette`, () => {
        const palette = paletteFromColor(seed, mode);
        for (const value of Object.values(palette)) assert.match(value, /^#[0-9a-f]{6}$/);
        assert.ok(contrastRatio(palette.text, palette.surface) >= 4.5, `text ${palette.text} on ${palette.surface}`);
        assert.ok(contrastRatio(palette.accent, palette.surface) >= 3, `accent ${palette.accent} on ${palette.surface}`);
      });
    }
  }

  it("keeps a light ground light and a dark one dark", () => {
    const sum = (hex) => hexToRgb(hex).reduce((a, b) => a + b, 0);
    assert.ok(sum(paletteFromColor("#3366cc", "light").background) > 2.4);
    assert.ok(sum(paletteFromColor("#3366cc", "dark").background) < 0.6);
  });

  it("reads the colours a browser computes", () => {
    assert.deepEqual(parseCssColor("rgb(255, 0, 51)"), [1, 0, 0.2]);
    assert.deepEqual(parseCssColor("color(srgb 0.5 0.25 1)"), [0.5, 0.25, 1]);
    assert.equal(parseCssColor("nope"), null);
    assert.equal(paletteFromColor("blue"), null);
  });
});
