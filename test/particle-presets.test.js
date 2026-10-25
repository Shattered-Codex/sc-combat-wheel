import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PARTICLE_AMOUNTS,
  PARTICLE_PRESETS,
  PARTICLE_TYPES,
  buildParticles,
  particleSignature,
} from "../scripts/helpers/particle-presets.js";

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

const box = { width: 200, height: 120 };
const particlesCss = readFileSync(new URL("../styles/particles.css", import.meta.url), "utf8");
const presetShapes = (type) => PARTICLE_PRESETS[type].shapes.map(([shape]) => shape);

describe("buildParticles", () => {
  it("returns nothing for none or an unknown type", () => {
    assert.deepEqual(buildParticles({ type: "none", box }), []);
    assert.deepEqual(buildParticles({ type: "glyphs", box }), []);
    assert.deepEqual(buildParticles({ box }), []);
  });

  it("has a preset for every type except none", () => {
    for (const type of PARTICLE_TYPES) assert.equal(type === "none", !PARTICLE_PRESETS[type]);
  });

  it("keeps the stored type ids in order, none first", () => {
    assert.deepEqual(PARTICLE_TYPES, [
      "none", "embers", "arcane", "stardust", "frost", "shadow", "fireflies", "petals", "bubbles", "sparks",
      "snow", "rain", "leaves", "ash", "motes", "confetti", "runes", "wisps",
    ]);
  });

  it("styles every type and every shape it uses", () => {
    for (const type of PARTICLE_TYPES.filter((key) => key !== "none")) {
      assert.ok(particlesCss.includes(`.scw-fx--${type} `), `no tint for ${type}`);
      for (const shape of presetShapes(type)) {
        assert.match(shape, /^\w+$/, `${type} has an unusable shape name ${shape}`);
        assert.ok(particlesCss.includes(`.scw-fx-ps--${shape}`), `no CSS for shape ${shape}`);
      }
    }
  });

  it("builds every type with every amount", () => {
    for (const type of PARTICLE_TYPES.filter((key) => key !== "none")) {
      for (const [amount, count] of Object.entries(PARTICLE_AMOUNTS)) {
        assert.equal(buildParticles({ type, amount, box, random: seeded(11) }).length, count, `${type}/${amount}`);
      }
    }
  });

  it("builds as many particles as the amount asks", () => {
    for (const [amount, count] of Object.entries(PARTICLE_AMOUNTS)) {
      assert.equal(buildParticles({ type: "embers", amount, box }).length, count);
    }
    assert.equal(buildParticles({ type: "embers", amount: "lots", box }).length, PARTICLE_AMOUNTS.normal);
  });

  it("is deterministic with a seeded random source", () => {
    for (const type of PARTICLE_TYPES) {
      const first = buildParticles({ type, box, random: seeded(42) });
      const second = buildParticles({ type, box, random: seeded(42) });
      assert.deepEqual(first, second);
    }
  });

  it("gives every particle timing, size and a shape from its type", () => {
    for (const type of PARTICLE_TYPES.filter((key) => key !== "none")) {
      const shapes = presetShapes(type);
      for (const { className, vars } of buildParticles({ type, amount: "many", box, random: seeded(7) })) {
        assert.ok(vars["--t"] && vars["--delay"] && vars["--s"], `${type} lacks --t/--delay/--s`);
        assert.ok(Object.values(vars).every((value) => typeof value === "string"));
        const shape = className.match(/scw-fx-ps--(\w+)/)?.[1];
        assert.ok(shapes.includes(shape), `${type} produced ${shape}`);
        assert.match(className, /^scw-fx-pt scw-fx-pm--(path|twinkle|spiral|sway|glimmer) /);
        const motion = className.match(/scw-fx-pm--(\w+)/)[1];
        assert.ok(particlesCss.includes(`.scw-fx-pm--${motion}`), `no CSS for motion ${motion}`);
        assert.equal(motion === "sway", "--w" in vars, `${type}: --w only on swaying particles`);
      }
    }
  });

  it("gives palette shapes a slot from 0 to 5", () => {
    for (const type of ["leaves", "confetti"]) {
      const slots = buildParticles({ type, amount: "many", box, random: seeded(5) }).map(({ vars }) => Number(vars["--k"]));
      assert.ok(slots.every((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 5), `${type}: ${slots}`);
      assert.ok(new Set(slots).size > 1, `${type} uses a single color`);
    }
    for (const { vars } of buildParticles({ type: "snow", box, random: seeded(5) })) assert.ok(!("--k" in vars));
  });

  it("moves each new type the way it is described", () => {
    const ys = (type) => buildParticles({ type, amount: "many", box, random: seeded(9) })
      .map(({ vars }) => parseFloat(vars["--p2y"]) - parseFloat(vars["--p0y"]));
    for (const type of ["snow", "rain", "leaves", "confetti"]) assert.ok(ys(type).every((dy) => dy > 0), `${type} falls`);
    for (const type of ["ash", "wisps"]) assert.ok(ys(type).every((dy) => dy < 0), `${type} rises`);
    for (const { vars } of buildParticles({ type: "rain", box, random: seeded(9) })) {
      const angle = parseFloat(vars["--r2"]);
      assert.ok(angle > 95 && angle < 115, `rain leans at ${angle}`);
    }
    for (const { className } of buildParticles({ type: "runes", box, random: seeded(9) })) {
      assert.match(className, /scw-fx-pm--spiral scw-fx-ps--rune[1-4]$/);
    }
  });

  it("stays finite for empty or tiny boxes", () => {
    for (const tiny of [undefined, { width: 0, height: 0 }, { width: 4, height: 4 }]) {
      for (const { vars } of buildParticles({ type: "sparks", box: tiny, random: seeded(3) })) {
        assert.ok(Object.values(vars).every((value) => !/NaN|Infinity/.test(value)));
      }
    }
  });
});

describe("particleSignature", () => {
  it("ignores tiny box changes", () => {
    assert.equal(
      particleSignature({ type: "frost", box: { width: 200, height: 120 } }),
      particleSignature({ type: "frost", box: { width: 202.5, height: 118 } }),
    );
  });

  it("changes with the type, amount or a real resize", () => {
    const base = particleSignature({ type: "frost", box });
    assert.notEqual(base, particleSignature({ type: "embers", box }));
    assert.notEqual(base, particleSignature({ type: "frost", amount: "many", box }));
    assert.notEqual(base, particleSignature({ type: "frost", box: { width: 260, height: 120 } }));
  });

  it("collapses none and unknown types", () => {
    assert.equal(particleSignature({ type: "none", box }), particleSignature({ type: "nope", box }));
  });
});
