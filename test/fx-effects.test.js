import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FLAME_STYLES, flameArc, flameTongues } from "../scripts/helpers/fx-flames.js";
import { SETTINGS_SCHEMA } from "../scripts/constants/settings-schema.js";
import WheelAppearance from "../scripts/applications/WheelAppearance.js";
import { layoutFromSettings } from "../scripts/helpers/view-layout.js";
import { widgetBounds } from "../scripts/helpers/wheel-geometry.js";

/** A small deterministic generator (mulberry32). */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const effectsCss = readFileSync(new URL("../styles/effects.css", import.meta.url), "utf8");
const choicesOf = (key) => SETTINGS_SCHEMA.find((entry) => entry.key === key).choices.filter((choice) => choice !== "none");
const at = (tongue) => ({ x: Number(tongue["--x"]), y: Number(tongue["--y"]), angle: parseFloat(tongue["--n"]) });

describe("flame tongues (RF-116)", () => {
  it("roots every tongue on the circle, within the arc asked for", () => {
    const tongues = flameTongues({ shape: "round", width: 340, height: 340, arc: flameArc("up"), random: seeded(1) });
    assert.ok(tongues.length >= 10 && tongues.length <= 44);
    for (const tongue of tongues) {
      const { x, y } = at(tongue);
      assert.ok(Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.5) < 1e-3, "on the circle");
      assert.ok(y <= 0.5 + 1e-3, "on the upper half, past the bar");
    }
  });

  it("roots every tongue on the rectangle's edges", () => {
    for (const tongue of flameTongues({ shape: "card", width: 300, height: 90, random: seeded(2) })) {
      const { x, y } = at(tongue);
      assert.ok([x, y].some((value) => value === 0 || value === 1), `${x},${y} is on an edge`);
    }
  });

  it("carries more tongues on a longer outline, within bounds", () => {
    const count = (width) => flameTongues({ shape: "round", width, height: width, random: seeded(3) }).length;
    assert.ok(count(400) > count(120));
    assert.equal(count(5000), 44);
    assert.equal(count(10), 10);
  });

  it("leans the inferno's tongues up more than the flames'", () => {
    const lean = (style) => {
      const tongues = flameTongues({ shape: "card", width: 200, height: 200, style, random: seeded(5) });
      // Distance from straight up (270°), on the side edges, where leaning shows.
      const sides = tongues.map(at).filter(({ x }) => x === 0 || x === 1);
      return sides.reduce((sum, { angle }) => sum + Math.abs(((angle - 270 + 540) % 360) - 180), 0) / sides.length;
    };
    assert.ok(lean("inferno") < lean("flames"));
  });

  it("grows with the boost and stays finite for any box", () => {
    const reach = (scale) => parseFloat(flameTongues({ shape: "round", width: 200, height: 200, scale, random: seeded(7) })[0]["--len"]);
    assert.ok(reach(1.4) > reach(1));
    for (const tongue of flameTongues({ shape: "round", width: 0, height: undefined, random: seeded(9) })) {
      assert.ok(Object.values(tongue).every((value) => !/NaN|Infinity/.test(value)));
    }
  });

  it("knows each side's half and the whole circle", () => {
    assert.deepEqual(flameArc("down"), [0, 180]);
    assert.deepEqual(flameArc(null), [0, 360]);
    assert.deepEqual(FLAME_STYLES, ["flames", "inferno"]);
  });
});

describe("effects.css draws every effect it is offered (RF-116)", () => {
  it("has the looping effects of the acting portrait and of the widget", () => {
    for (const fx of new Set([...choicesOf("actingEffect"), ...choicesOf("widgetEffect")])) {
      if (fx === "shine") assert.ok(effectsCss.includes('[data-scw-acting-fx="shine"]'));
      else assert.ok(effectsCss.includes(`[data-fx="${fx}"]`), `no CSS for ${fx}`);
    }
  });

  it("has every wave style and every turn effect", () => {
    for (const waves of choicesOf("actingWaves")) assert.ok(effectsCss.includes(`[data-waves="${waves}"]`), `no CSS for ${waves}`);
    for (const turn of choicesOf("turnEffect")) assert.ok(effectsCss.includes(`[data-scw-turn-fx="${turn}"]`), `no CSS for ${turn}`);
  });

  it("only offers the widget what draws around an outline", () => {
    assert.ok(choicesOf("widgetEffect").every((fx) => choicesOf("actingEffect").includes(fx)));
    for (const filler of ["aura", "flicker", "void", "shine"]) assert.ok(!choicesOf("widgetEffect").includes(filler));
  });

  it("keeps braces balanced and every mask inlined", () => {
    assert.equal((effectsCss.match(/\{/g) ?? []).length, (effectsCss.match(/\}/g) ?? []).length);
    assert.ok(!/\{[A-Z_]+\}/.test(effectsCss), "a template placeholder was left");
    for (const mask of ["--scw-rune-ring", "--scw-storm-a", "--scw-storm-b", "--scw-rune-h", "--scw-rune-v", "--scw-arc-h", "--scw-arc-v"]) {
      assert.match(effectsCss, new RegExp(`${mask}: url\\("data:image/svg\\+xml,`), mask);
    }
  });
});

describe("room the effects need in the editor's preview (RF-116)", () => {
  const quiet = { actingEffect: "none", actingWaves: "none", turnEffect: "none", widgetEffect: "none", particleType: "none", particlePlacement: "acting", particleIntensity: "normal" };
  const wheel = (preset = "compact") => layoutFromSettings({ view: "wheel", layoutPreset: preset, anchor: "middle", portraitShape: "sector", sliceGap: 0.8 });
  const height = (bounds) => bounds.maxY - bounds.minY;
  const width = (bounds) => bounds.maxX - bounds.minX;

  it("needs nothing past the widget without effects or particles", () => {
    assert.equal(WheelAppearance.fxBounds(quiet, wheel(), "up"), null);
  });

  it("reaches farther around a bigger layout", () => {
    const look = { ...quiet, actingEffect: "rays" };
    const small = WheelAppearance.fxBounds(look, wheel("mini"), "up");
    const large = WheelAppearance.fxBounds(look, wheel("large"), "up");
    assert.ok(height(large) > height(small));
  });

  it("makes room for particles around the widget, with no aura or turn effect at all", () => {
    const layout = wheel("large");
    const look = { ...quiet, particleType: "embers", particlePlacement: "widget" };
    const fx = WheelAppearance.fxBounds(look, layout, "up");
    const own = widgetBounds(layout, "up", 32);
    assert.ok(fx.minY < own.minY && fx.minX < own.minX && fx.maxX > own.maxX, "they fly past the wheel");
  });

  it("knows every effect offered around the widget, never past the bar on the wheel, and grows with the intensity", () => {
    for (const fx of choicesOf("widgetEffect")) assert.ok(WheelAppearance.fxBounds({ ...quiet, widgetEffect: fx }, wheel(), "up"), fx);
    for (const [side, edge] of [["up", "maxY"], ["down", "minY"], ["left", "maxX"], ["right", "minX"]]) {
      assert.equal(WheelAppearance.fxBounds({ ...quiet, widgetEffect: "flames" }, wheel(), side)[edge], 0, side);
    }
    const reach = (particleIntensity) => width(WheelAppearance.fxBounds({ ...quiet, widgetEffect: "runes", particleIntensity }, wheel(), "up"));
    assert.ok(reach("strong") > reach("normal") && reach("normal") > reach("subtle"));
  });

  it("measures the cards' row too", () => {
    const cards = layoutFromSettings({ view: "carousel", trackSize: "medium", trackShape: "square", trackReach: 3, trackSpacing: 8, anchor: "middle", orientation: "up" });
    const fx = WheelAppearance.fxBounds({ ...quiet, widgetEffect: "halo", turnEffect: "shockwave" }, cards, "up");
    assert.ok(width(fx) > 0 && height(fx) > 0);
  });
});
