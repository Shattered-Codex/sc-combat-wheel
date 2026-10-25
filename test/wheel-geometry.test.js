import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAYOUT_PRESETS, TIMING } from "../scripts/constants/module-constants.js";
import {
  ARC_POINTS,
  customPreset,
  isPortraitRatioOk,
  gridClip,
  layoutFor,
  mod,
  gridLayout,
  portraitBox,
  presetFromSettings,
  sectorPolygon,
  shortestOffset,
  squarePolygon,
  stepPlan,
  widgetBounds,
  windowSlots,
} from "../scripts/helpers/wheel-geometry.js";
import { layoutFromSettings } from "../scripts/helpers/view-layout.js";

const compact = layoutFor(LAYOUT_PRESETS.compact);
const visibleBy = (slots) =>
  slots.filter((slot) => slot.visible).sort((a, b) => a.position - b.position);

describe("layoutFor", () => {
  it("derives the visible count from the slice angle", () => {
    assert.equal(compact.V, 3);
    assert.equal(compact.M, 11);
    assert.equal(layoutFor(LAYOUT_PRESETS.dense).V, 4);
    assert.equal(layoutFor(LAYOUT_PRESETS.dense).M, 13);
  });

  it("puts the left anchor on the first whole slice", () => {
    assert.equal(layoutFor(LAYOUT_PRESETS.compact, "left").offset, -2);
    assert.equal(compact.offset, 0);
  });

  it("never makes the bar narrower than its controls", () => {
    assert.equal(layoutFor(LAYOUT_PRESETS.mini).barWidth, 460);
    assert.equal(layoutFor(LAYOUT_PRESETS.large).barWidth, 500);
  });
});

describe("windowSlots", () => {
  it("shows 2V+1 slices with the turn at the anchor, regardless of N", () => {
    for (const N of [3, 8, 40]) {
      const slots = windowSlots({ T: 10, N, layout: compact });
      assert.equal(slots.length, compact.M);
      const visible = visibleBy(slots);
      assert.equal(visible.length, 7, `N=${N}`);
      const active = slots.find((slot) => slot.active);
      assert.equal(active.position, 0);
      assert.equal(active.combatantIndex, mod(10, N));
    }
  });

  it("orders the queue to the right and the past to the left", () => {
    const visible = visibleBy(windowSlots({ T: 10, N: 40, layout: compact }));
    assert.deepEqual(
      visible.map((slot) => slot.combatantIndex),
      [7, 8, 9, 10, 11, 12, 13],
    );
    assert.deepEqual(
      visible.map((slot) => slot.past),
      [true, true, true, false, false, false, false],
    );
  });

  it("repeats a short queue and reports the round of each repetition", () => {
    const visible = visibleBy(windowSlots({ T: 0, N: 3, layout: compact }));
    assert.deepEqual(visible.map((slot) => slot.combatantIndex), [0, 1, 2, 0]);
    assert.deepEqual(visible.map((slot) => slot.round), [1, 1, 1, 2]);
  });

  it("draws nothing before the first turn of the combat", () => {
    const slots = windowSlots({ T: 0, N: 8, layout: compact });
    assert.ok(slots.filter((slot) => slot.s < 0).every((slot) => !slot.visible));
  });

  it("keeps every slot but one on the same sequence after a single step", () => {
    const before = windowSlots({ T: 10, N: 8, layout: compact });
    const after = windowSlots({ T: 11, N: 8, layout: compact });
    const moved = before.filter((slot, i) => slot.s !== after[i].s);
    assert.equal(moved.length, 1);
    assert.ok(moved[0].edge && after[moved[0].index].edge, "the recycled slot jumps edge to edge");
  });

  it("shifts the turn onto the end anchor, with one turn to come after it", () => {
    const end = layoutFor(LAYOUT_PRESETS.compact, "end");
    assert.equal(end.offset, 2);
    const visible = visibleBy(windowSlots({ T: 10, N: 40, layout: end }));
    const active = visible.find((slot) => slot.active);
    assert.equal(active.position, 2);
    assert.equal(visible.filter((slot) => !slot.past && !slot.active).length, 1);
  });

  it("shifts the turn onto the left anchor", () => {
    const left = layoutFor(LAYOUT_PRESETS.compact, "left");
    const visible = visibleBy(windowSlots({ T: 10, N: 40, layout: left }));
    const active = visible.find((slot) => slot.active);
    assert.equal(active.position, -2);
    assert.equal(visible.filter((slot) => slot.past).length, 1);
  });

  it("returns empty slots for an empty combat", () => {
    const slots = windowSlots({ T: 0, N: 0, layout: compact });
    assert.ok(slots.every((slot) => !slot.visible && slot.combatantIndex === null));
  });
});

describe("sectorPolygon", () => {
  it("always has the same number of points, so clip-path can interpolate", () => {
    for (const polygon of [compact.sector, compact.activeSector, sectorPolygon(compact, 300, 10)]) {
      assert.equal(polygon.split(",").length, 2 * ARC_POINTS);
    }
  });
});

describe("portraitBox", () => {
  it("is centred horizontally in the slice square", () => {
    const box = portraitBox(compact);
    assert.ok(Math.abs(box.left + box.size / 2 - compact.Rm) < 1e-9);
    assert.ok(box.size > 0);
  });
});

describe("stepPlan", () => {
  it("rotates one step over the single-step duration", () => {
    assert.deepEqual(stepPlan(4, 5), { mode: "rotate", steps: [5], duration: TIMING.singleStep });
  });

  it("walks short jumps step by step in either direction", () => {
    const plan = stepPlan(10, 6);
    assert.equal(plan.mode, "rotate");
    assert.deepEqual(plan.steps, [9, 8, 7, 6]);
    assert.equal(plan.duration, TIMING.jumpStep);
  });

  it("fades long jumps, disabled animation and reduced motion", () => {
    assert.equal(stepPlan(0, 20).mode, "fade");
    assert.equal(stepPlan(0, 1, { speed: 0 }).mode, "fade");
    assert.equal(stepPlan(0, 1, { reducedMotion: true }).mode, "fade");
  });

  it("does nothing when the turn did not change", () => {
    assert.equal(stepPlan(3, 3).mode, "none");
  });

  it("scales durations by the animation speed", () => {
    assert.equal(stepPlan(0, 1, { speed: 1.5 }).duration, TIMING.singleStep * 1.5);
  });
});

describe("shortestOffset", () => {
  it("goes the short way round the ring", () => {
    assert.equal(shortestOffset(0, 2, 8), 2);
    assert.equal(shortestOffset(0, 7, 8), -1);
    assert.equal(shortestOffset(6, 1, 8), 3);
    assert.equal(shortestOffset(3, 3, 8), 0);
    assert.equal(shortestOffset(0, 0, 0), 0);
  });
});

describe("squarePolygon", () => {
  it("has as many points as a sector, so the grid transition interpolates", () => {
    assert.equal(squarePolygon(compact, 72).split(",").length, compact.sector.split(",").length);
  });
});

describe("gridLayout", () => {
  it("puts every combatant in its own cell", () => {
    const grid = gridLayout({ N: 16 });
    assert.equal(grid.cells.length, 16);
    assert.equal(new Set(grid.cells.map((c) => `${c.x},${c.y}`)).size, 16);
    assert.ok(grid.cols >= 4 && grid.cols <= 8);
  });

  it("never uses more columns than combatants", () => {
    assert.equal(gridLayout({ N: 3 }).cols, 3);
  });

  it("shrinks to fit the available room", () => {
    const grid = gridLayout({ N: 40, maxHeight: 300 });
    assert.ok(grid.height <= 300 + 1e-9);
    assert.ok(grid.scale < 1);
  });
});

describe("square portraits", () => {
  const squares = layoutFor(LAYOUT_PRESETS.compact, "middle", { shape: "square" });

  it("comes from the shape option", () => {
    assert.equal(squares.shape, "square");
    assert.equal(compact.shape, "sector");
  });

  it("clips slices and grid cells with the same kind of shape", () => {
    assert.match(squares.sector, /^inset\(/);
    assert.match(gridClip(squares, 72), /^inset\(/);
    assert.match(gridClip(compact, 72), /^polygon\(/);
  });

  it("grows the active square outward, keeping its inner edge", () => {
    const inner = (box) => box.top + box.size;
    assert.ok(squares.activePortrait.size > squares.portrait.size);
    assert.ok(Math.abs(inner(squares.activePortrait) - inner(squares.portrait)) < 1e-9);
  });

  it("lets the gap override the preset", () => {
    assert.ok(layoutFor(LAYOUT_PRESETS.compact, "middle", { gap: 3 }).half < compact.half);
  });
});

describe("custom layout (SPEC §6)", () => {
  it("clamps the user's values into a drawable wheel", () => {
    const preset = customPreset({ outer: 1000, inner: 990, step: 90 });
    assert.equal(preset.R, 400);
    assert.equal(preset.r0, 360);
    assert.equal(preset.step, 45);
  });

  it("derives the visible count from the angle", () => {
    assert.equal(layoutFor(customPreset({ outer: 200, inner: 120, step: 18 })).V, 5);
  });

  it("accepts the shipped presets and flags stretched portraits", () => {
    assert.ok(isPortraitRatioOk(LAYOUT_PRESETS.compact));
    assert.equal(isPortraitRatioOk(customPreset({ outer: 300, inner: 100, step: 15 })), false);
  });
});

describe("layout from settings", () => {
  const values = { layoutPreset: "compact", customOuter: 180, customInner: 104, customStep: 30, anchor: "middle", portraitShape: "sector", sliceGap: 0.8 };

  it("reads a named preset, the custom one, and falls back on unknown names", () => {
    assert.equal(presetFromSettings(values), LAYOUT_PRESETS.compact);
    assert.equal(presetFromSettings({ ...values, layoutPreset: "custom" }).R, 180);
    assert.equal(presetFromSettings({ ...values, layoutPreset: "gone" }), LAYOUT_PRESETS.compact);
  });

  it("takes the portrait shape from its own setting", () => {
    assert.equal(layoutFromSettings({ ...values, portraitShape: "square" }).shape, "square");
    assert.equal(layoutFromSettings(values).shape, "sector");
  });

  it("draws the wheel unless a card view is picked (RF-90)", () => {
    assert.equal(layoutFromSettings(values).view, "wheel");
    assert.equal(layoutFromSettings({ ...values, view: "wheel" }).view, "wheel");
    assert.equal(layoutFromSettings({ ...values, view: "gone" }).view, "wheel");
    const track = layoutFromSettings({ ...values, view: "slider", trackSize: "large", trackReach: 4, orientation: "up" });
    assert.equal(track.view, "slider");
    assert.equal(track.cardWidth, 96);
    assert.equal(track.V, 4);
  });

  it("bounds the widget on the arc side and the bar side of each direction", () => {
    const layout = { depth: 172, across: 172, barWidth: 460 };
    assert.deepEqual(widgetBounds(layout, "up", 44), { minX: -230, maxX: 230, minY: -172, maxY: 44 });
    assert.deepEqual(widgetBounds(layout, "down", 44), { minX: -230, maxX: 230, minY: -44, maxY: 172 });
    assert.deepEqual(widgetBounds(layout, "right", 44), { minX: -44, maxX: 172, minY: -230, maxY: 230 });
    assert.deepEqual(widgetBounds(layout, "left", 320), { minX: -172, maxX: 320, minY: -230, maxY: 230 });
  });
});
