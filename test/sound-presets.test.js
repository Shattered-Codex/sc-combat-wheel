import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SOUND_CHOICES, SYNTH_PRESETS, resolveSound } from "../scripts/helpers/sound-presets.js";

describe("resolveSound (RF-52)", () => {
  it("resolves synth presets, core sounds and custom files", () => {
    assert.equal(resolveSound("bell").kind, "synth");
    assert.deepEqual(resolveSound("coreNotify"), { kind: "file", src: "sounds/notify.wav" });
    assert.deepEqual(resolveSound("file", "sfx/turn.ogg"), { kind: "file", src: "sfx/turn.ogg" });
  });

  it("plays nothing for off, unknown values or a file choice without a path", () => {
    assert.equal(resolveSound("off"), null);
    assert.equal(resolveSound("removed"), null);
    assert.equal(resolveSound("file", ""), null);
  });

  it("offers every preset in the menu, and keeps layers short and quiet", () => {
    for (const id of Object.keys(SYNTH_PRESETS)) assert.ok(SOUND_CHOICES.includes(id));
    for (const layers of Object.values(SYNTH_PRESETS)) {
      for (const layer of layers) {
        assert.ok(layer.duration <= 2 && layer.gain <= 0.25);
      }
    }
  });
});
