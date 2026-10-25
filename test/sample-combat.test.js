import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { SAMPLE_COMBATANTS, sampleWheelModel } from "../scripts/helpers/sample-combat.js";

describe("sample combat (RF-73)", () => {
  it("runs in initiative order, with more entries than the densest wheel shows", () => {
    const initiatives = SAMPLE_COMBATANTS.map((entry) => entry.initiative);
    assert.deepEqual(initiatives, [...initiatives].sort((a, b) => b - a));
    assert.ok(SAMPLE_COMBATANTS.length > 9);
  });

  it("shows every look of the wheel at least once", () => {
    const { ring } = sampleWheelModel();
    for (const side of ["friendly", "neutral", "hostile"]) assert.ok(ring.some((vm) => vm.dispositionKey === side), side);
    assert.ok(ring.some((vm) => vm.dead));
    assert.ok(ring.some((vm) => vm.virtual));
    assert.ok(ring.some((vm) => vm.healthTone === "danger"));
  });

  it("turns like a real combat: T picks the actor and the round", () => {
    const N = SAMPLE_COMBATANTS.length;
    const model = sampleWheelModel({ T: N + 2, names: { wolf: "Lobo" } });
    assert.equal(model.N, N);
    assert.equal(model.currentIndex, 2);
    assert.equal(model.round, 2);
    assert.equal(model.current, model.ring[2]);
    assert.equal(model.current.name, "Lobo");
    assert.equal(model.turnLabel, `3/${N}`);
    assert.equal(sampleWheelModel({ T: -5 }).T, 0);
  });

  it("names every sample combatant in both languages", async () => {
    for (const lang of ["en", "pt-BR"]) {
      const root = JSON.parse(await readFile(new URL(`../lang/${lang}.json`, import.meta.url), "utf8")).SC_COMBAT_WHEEL;
      for (const { key } of SAMPLE_COMBATANTS) assert.equal(typeof root.Appearance.Names[key], "string", `${lang} ${key}`);
    }
  });
});
