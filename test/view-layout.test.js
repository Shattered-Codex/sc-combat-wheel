import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutFromSettings, particleBox } from "../scripts/helpers/view-layout.js";

const values = { layoutPreset: "compact", anchor: "middle", portraitShape: "sector", sliceGap: 0.8, trackSize: "medium", trackReach: 3 };
const close = (a, b) => Math.abs(a - b) < 0.01;

describe("particleBox (RF-95)", () => {
  it("puts the acting box on the anchor slice of the wheel, turned with the direction", () => {
    const layout = layoutFromSettings({ ...values, view: "wheel" });
    const up = particleBox(layout, "up", "acting");
    assert.ok(close(up.x, 0) && up.y < 0);
    const right = particleBox(layout, "right", "acting");
    assert.ok(right.x > 0 && close(right.y, 0));
    const down = particleBox(layout, "down", "acting");
    assert.ok(close(down.x, 0) && down.y > 0);
  });

  it("covers the half disc, or the cards, for the whole widget", () => {
    const wheel = layoutFromSettings({ ...values, view: "wheel" });
    assert.deepEqual(particleBox(wheel, "up", "widget"), { x: 0, y: -wheel.Rm / 2, width: 2 * wheel.Rm, height: wheel.Rm });
    const cards = layoutFromSettings({ ...values, view: "carousel", orientation: "left" });
    const box = particleBox(cards, "left", "widget");
    assert.ok(box.x < 0 && close(box.y, 0) && box.height > box.width);
  });

  it("follows the acting card's pose in the card views", () => {
    const cards = layoutFromSettings({ ...values, view: "slider", orientation: "up" });
    const box = particleBox(cards, "up", "acting");
    const pose = cards.poses[cards.offset + cards.HW];
    assert.deepEqual({ x: box.x, y: box.y }, pose.center);
    assert.ok(close(box.width, cards.cardWidth * pose.scale));
  });
});
