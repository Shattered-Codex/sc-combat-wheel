import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INITIATIVE_BADGES, INITIATIVE_POSITIONS, initiativeBadgeAppearance, initiativePosition, marksBelowInitiative } from "../scripts/helpers/initiative-badges.js";
import { SETTINGS_SCHEMA, coerceSetting, isSettingShown } from "../scripts/constants/settings-schema.js";

describe("initiative badge appearance", () => {
  it("keeps legacy and invalid choices on the theme's original badge", () => {
    for (const value of [undefined, null, "", "retired", "__proto__", "theme"]) {
      assert.deepEqual(initiativeBadgeAppearance(value), { shape: "theme", fill: "none", outline: "none" });
    }
    assert.deepEqual(initiativeBadgeAppearance("text"), { shape: "text", fill: "none", outline: "none" });
  });

  it("ships complete local vector masks with distinct silhouettes and die facets", () => {
    const drawings = Object.entries(INITIATIVE_BADGES).filter(([, drawing]) => drawing);
    assert.equal(drawings.length, 13);
    assert.equal(new Set(drawings.map(([, drawing]) => drawing.outline)).size, drawings.length);
    for (const [shape, drawing] of drawings) {
      assert.equal(initiativeBadgeAppearance(shape).shape, shape);
      for (const encoded of [drawing.fill, drawing.outline]) {
        assert.match(encoded, /^url\("data:image\/svg\+xml,/);
        const svg = decodeURIComponent(encoded.slice('url("data:image/svg+xml,'.length, -2));
        assert.match(svg, /viewBox="0 0 100 100"/);
        assert.match(svg, /<path d="[MLHVQACZ0-9 .]+"/);
        assert.doesNotMatch(svg, /(?:href|script|foreignObject|<text)/);
      }
      if (/^d\d+$/.test(shape)) assert.match(decodeURIComponent(drawing.outline), /opacity=".4"/);
    }
  });

  it("offers the shape only with initiative enabled, independently of theme and layout", () => {
    const entry = SETTINGS_SCHEMA.find((row) => row.key === "initiativeBadge");
    assert.equal(entry.default, "theme");
    assert.equal(entry.scope, "user");
    assert.equal(entry.panel, "portraits");
    for (const view of ["wheel", "carousel", "slider"]) {
      assert.equal(isSettingShown(entry, { view, showInitiative: false }), false);
      assert.equal(isSettingShown(entry, { view, showInitiative: true }), true);
    }
    for (const shape of Object.keys(INITIATIVE_BADGES)) assert.equal(coerceSetting(entry, shape), shape);
    assert.equal(coerceSetting(entry, "removed-shape"), null);
  });

  it("sizes the badge from half to one and a half times its shape, wherever initiative shows", () => {
    const entry = SETTINGS_SCHEMA.find((row) => row.key === "initiativeBadgeSize");
    assert.equal(entry.default, 100, "the shapes keep their own size until the user picks one");
    assert.equal(entry.scope, "user");
    assert.equal(entry.panel, "portraits");
    assert.equal(coerceSetting(entry, 10), 50);
    assert.equal(coerceSetting(entry, 500), 150);
    for (const view of ["wheel", "carousel", "slider"]) {
      assert.equal(isSettingShown(entry, { view, showInitiative: false }), false);
      assert.equal(isSettingShown(entry, { view, showInitiative: true }), true);
    }
  });

  it("places the badge on the cards only, keeping the theme's place by default", () => {
    const entry = SETTINGS_SCHEMA.find((row) => row.key === "initiativeBadgePosition");
    assert.equal(entry.default, "theme");
    assert.deepEqual(entry.choices, INITIATIVE_POSITIONS);
    assert.equal(isSettingShown(entry, { view: "wheel", showInitiative: true }), false, "a slice has no corners to pick");
    for (const view of ["carousel", "slider"]) {
      assert.equal(isSettingShown(entry, { view, showInitiative: true }), true);
      assert.equal(isSettingShown(entry, { view, showInitiative: false }), false);
    }
    for (const value of INITIATIVE_POSITIONS) assert.equal(initiativePosition(value), value);
    for (const value of [undefined, null, "", "middle", "__proto__"]) assert.equal(initiativePosition(value), "theme");
  });

  it("sizes the number and nudges the badge in every view, with initiative shown", () => {
    const entry = (key) => SETTINGS_SCHEMA.find((row) => row.key === key);
    const font = entry("initiativeBadgeFontSize");
    assert.equal(font.default, 100);
    assert.equal(coerceSetting(font, 10), 50);
    assert.equal(coerceSetting(font, 900), 200);
    for (const key of ["initiativeBadgeOffsetX", "initiativeBadgeOffsetY"]) {
      const offset = entry(key);
      assert.equal(offset.default, 0, "the badge stays where its place puts it");
      assert.equal(coerceSetting(offset, -100), -40);
      assert.equal(coerceSetting(offset, 100), 40);
      assert.equal(coerceSetting(offset, -12), -12);
    }
    for (const row of [font, entry("initiativeBadgeOffsetX"), entry("initiativeBadgeOffsetY")]) {
      assert.equal(row.scope, "user");
      assert.equal(row.panel, "portraits");
      for (const view of ["wheel", "carousel", "slider"]) {
        assert.equal(isSettingShown(row, { view, showInitiative: true }), true);
        assert.equal(isSettingShown(row, { view, showInitiative: false }), false);
      }
    }
  });

  it("moves the round's badge and the marks to their own line only for a changed badge in the top row", () => {
    const legacy = { initiativeBadge: "theme", initiativeBadgePosition: "theme", initiativeBadgeSize: 100, initiativeBadgeFontSize: 100, initiativeBadgeOffsetX: 0, initiativeBadgeOffsetY: 0 };
    assert.equal(marksBelowInitiative(legacy), false, "each theme's own badge keeps its design");
    assert.equal(marksBelowInitiative({}), false, "older looks without the new settings too");
    for (const change of [{ initiativeBadge: "d20" }, { initiativeBadgePosition: "top-right" }, { initiativeBadgePosition: "top" }, { initiativeBadgePosition: "top-left" },
      { initiativeBadgeSize: 150 }, { initiativeBadgeFontSize: 200 }, { initiativeBadgeOffsetY: 6 }, { initiativeBadgeOffsetX: -3 }]) {
      assert.equal(marksBelowInitiative({ ...legacy, ...change }), true, JSON.stringify(change));
    }
    for (const initiativeBadgePosition of ["bottom-left", "bottom", "bottom-right"]) {
      assert.equal(marksBelowInitiative({ ...legacy, initiativeBadge: "d20", initiativeBadgeSize: 150, initiativeBadgePosition }), false, "a badge at the bottom leaves the top row alone");
    }
  });
});
