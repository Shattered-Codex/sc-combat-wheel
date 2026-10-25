import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BAR_MIN_WIDTH } from "../scripts/constants/module-constants.js";
import { MAX_REACH, MIN_REACH, cardClip, trackLayout, trackPose } from "../scripts/helpers/track-geometry.js";
import { OVERVIEW_GRID, gridClip, widgetBounds, windowSlots } from "../scripts/helpers/wheel-geometry.js";

const carousel = trackLayout({ view: "carousel", size: "medium", reach: 3, orientation: "up" });
const slider = trackLayout({ view: "slider", size: "medium", reach: 3, orientation: "up" });
const poseAt = (layout, position) => trackPose(layout, position);

describe("trackLayout (RF-90)", () => {
  it("uses the wheel's window: V cards each side, one hidden beyond each end", () => {
    assert.equal(carousel.V, 3);
    assert.equal(carousel.HW, 4);
    assert.equal(carousel.M, 9);
    assert.equal(carousel.poses.length, carousel.M);
    const visible = windowSlots({ T: 20, N: 12, layout: carousel }).filter((slot) => slot.visible);
    assert.equal(visible.length, 2 * carousel.V + 1);
  });

  it("clamps the reach and falls back on unknown sizes and views", () => {
    assert.equal(trackLayout({ view: "carousel", reach: 99 }).V, MAX_REACH);
    assert.equal(trackLayout({ view: "carousel", reach: 1 }).V, MIN_REACH);
    assert.equal(trackLayout({ view: "carousel", size: "huge", reach: 3 }).cardWidth, 72);
    assert.equal(trackLayout({ view: "carousel", shape: "odd", reach: 3 }).cardHeight, 72);
    assert.equal(trackLayout({ view: "nope", reach: 3 }).view, "carousel");
  });

  it("runs the next turns forward: right along a bar, down along a rail", () => {
    for (const orientation of ["up", "down"]) {
      const layout = trackLayout({ view: "carousel", reach: 3, orientation });
      assert.ok(poseAt(layout, 1).center.x > poseAt(layout, 0).center.x, orientation);
      assert.ok(poseAt(layout, -1).center.x < poseAt(layout, 0).center.x, orientation);
    }
    for (const orientation of ["left", "right"]) {
      const layout = trackLayout({ view: "carousel", reach: 3, orientation });
      assert.ok(poseAt(layout, 1).center.y > poseAt(layout, 0).center.y, orientation);
    }
  });

  it("puts the cards on the far side of the bar, right past it", () => {
    const sides = { up: (c) => c.y < 0, down: (c) => c.y > 0, right: (c) => c.x > 0, left: (c) => c.x < 0 };
    for (const [orientation, beyond] of Object.entries(sides)) {
      const vertical = orientation === "left" || orientation === "right";
      const innerEdge = (layout) => Math.min(...layout.poses.map((pose) => {
        const out = vertical ? Math.abs(pose.center.x) : Math.abs(pose.center.y);
        return out - ((vertical ? layout.cardWidth : layout.cardHeight) * pose.scale) / 2;
      }));
      const bare = trackLayout({ view: "slider", reach: 3, orientation });
      for (const pose of bare.poses) assert.ok(beyond(pose.center), orientation);
      assert.ok(innerEdge(bare) > 0 && innerEdge(bare) < 12, orientation);
    }
  });

  it("stands rectangular cards upright, their height along a side rail", () => {
    const tall = trackLayout({ view: "carousel", shape: "tall", reach: 3, orientation: "up" });
    assert.ok(tall.cardHeight > tall.cardWidth);
    const pitch = (layout, axis) => poseAt(layout, 2).center[axis] - poseAt(layout, 1).center[axis];
    assert.ok(Math.abs(pitch(tall, "x") - (tall.cardWidth + 8)) < 0.01);
    const rail = trackLayout({ view: "carousel", shape: "tall", reach: 3, orientation: "right" });
    assert.ok(Math.abs(pitch(rail, "y") - (rail.cardHeight + 8)) < 0.01);
  });

  it("grows the acting card and stacks the nearer cards on top", () => {
    assert.ok(poseAt(carousel, 0).scale > poseAt(carousel, 1).scale);
    assert.equal(poseAt(carousel, 1).scale, poseAt(carousel, 3).scale);
    assert.ok(poseAt(slider, 1).scale > poseAt(slider, 2).scale);
    assert.ok(poseAt(slider, 0).z > poseAt(slider, 1).z);
    assert.equal(poseAt(slider, -2).z, poseAt(slider, 2).z);
  });

  it("spaces the cards as asked, overlapping below zero", () => {
    const gapBetween = (layout, a, b) =>
      poseAt(layout, b).center.x - poseAt(layout, a).center.x - (layout.cardWidth * (poseAt(layout, a).scale + poseAt(layout, b).scale)) / 2;
    assert.ok(Math.abs(gapBetween(carousel, 1, 2) - 8) < 0.01);
    const tight = trackLayout({ view: "carousel", reach: 3, spacing: -10 });
    assert.ok(Math.abs(gapBetween(tight, 1, 2) + 10) < 0.01);
    assert.ok(Math.abs(gapBetween(trackLayout({ view: "carousel", reach: 3, spacing: 99 }), 1, 2) - 24) < 0.01);
  });

  it("turns the slider's side cards toward the acting one, and only those", () => {
    assert.match(poseAt(slider, 0).transform, /rotateY\(0deg\)/);
    assert.match(poseAt(slider, -1).transform, /rotateY\(30deg\)/);
    assert.match(poseAt(slider, 1).transform, /rotateY\(-30deg\)/);
    assert.match(poseAt(carousel, 2).transform, /rotateY\(0deg\)/);
    const rail = trackLayout({ view: "slider", reach: 3, orientation: "right" });
    assert.match(poseAt(rail, 1).transform, /rotateX\(30deg\)/);
  });

  it("centres the visible cards, and moves the acting one to the start for the left anchor", () => {
    const left = poseAt(carousel, -carousel.V).center.x;
    const right = poseAt(carousel, carousel.V).center.x;
    assert.ok(Math.abs(left + right) < 0.01);
    const start = trackLayout({ view: "carousel", reach: 3, anchor: "left", orientation: "up" });
    assert.equal(start.offset, -2);
    assert.ok(start.focus.x < 0);
    const end = trackLayout({ view: "carousel", reach: 3, anchor: "end", orientation: "up" });
    assert.equal(end.offset, 2);
    assert.ok(end.focus.x > 0);
  });

  it("makes the bar span the cards and keeps the overview's tiles inside its square", () => {
    assert.ok(carousel.barWidth >= BAR_MIN_WIDTH);
    assert.ok(carousel.barWidth >= 2 * carousel.across - 1);
    const large = trackLayout({ view: "slider", size: "large", reach: 6 });
    assert.ok(large.S >= OVERVIEW_GRID.tile);
    assert.ok(large.S >= large.cardWidth * poseAt(large, 0).scale);
    assert.match(gridClip(large, large.cardWidth), /^inset\(/);
    const wide = trackLayout({ view: "slider", size: "large", shape: "wide", reach: 6 });
    assert.ok(wide.S >= wide.cardWidth * poseAt(wide, 0).scale);
    assert.match(cardClip(wide, 1), /^inset\(/);
  });

  it("bounds the widget on the card side", () => {
    const bounds = widgetBounds(carousel, "up", 44);
    assert.equal(bounds.minY, -carousel.depth);
    assert.equal(bounds.maxY, 44);
    assert.ok(bounds.maxX >= carousel.barWidth / 2);
  });
});
