import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthSourceFor, healthTone, readHealth } from "../scripts/helpers/health-source.js";

const actor = (system) => ({ actor: { system } });

describe("healthSourceFor (RF-47)", () => {
  it("uses the system preset in auto mode", () => {
    assert.deepEqual(healthSourceFor({ source: "auto", systemId: "dnd5e" }), { kind: "path", path: "attributes.hp", inverted: false });
    assert.equal(healthSourceFor({ source: "auto", systemId: "daggerheart" }).inverted, true);
  });

  it("falls back to the system's primary token attribute, then bar 1", () => {
    assert.equal(healthSourceFor({ source: "auto", systemId: "custom", primaryTokenAttribute: "health" }).path, "health");
    assert.deepEqual(healthSourceFor({ source: "auto", systemId: "custom" }), { kind: "bar", bar: "bar1" });
  });

  it("honours an explicit bar or attribute path, ignoring an empty path", () => {
    assert.deepEqual(healthSourceFor({ source: "bar2" }), { kind: "bar", bar: "bar2" });
    assert.deepEqual(healthSourceFor({ source: "attribute", path: " vitals.hp ", inverted: true }), { kind: "path", path: "vitals.hp", inverted: true });
    assert.equal(healthSourceFor({ source: "attribute", path: "", systemId: "pf2e" }).path, "attributes.hp");
  });
});

describe("readHealth", () => {
  it("reads value and max under a parent path", () => {
    const source = { kind: "path", path: "attributes.hp", inverted: false };
    assert.deepEqual(readHealth(actor({ attributes: { hp: { value: 12, max: 30 } } }), source), { value: 12, max: 30 });
  });

  it("turns damage-counting values into remaining health", () => {
    const source = { kind: "path", path: "resources.hitPoints", inverted: true };
    assert.deepEqual(readHealth(actor({ resources: { hitPoints: { value: 2, max: 6 } } }), source), { value: 4, max: 6 });
  });

  it("reads token bars", () => {
    const combatant = { token: { getBarAttribute: () => ({ type: "bar", value: 5, max: 10 }) } };
    assert.deepEqual(readHealth(combatant, { kind: "bar", bar: "bar1" }), { value: 5, max: 10 });
  });

  it("returns null for missing actors, paths or maxima", () => {
    const source = { kind: "path", path: "attributes.hp", inverted: false };
    assert.equal(readHealth({}, source), null);
    assert.equal(readHealth(actor({}), source), null);
    assert.equal(readHealth(actor({ attributes: { hp: { value: 3, max: 0 } } }), source), null);
  });
});

describe("healthTone", () => {
  it("uses Sidebar Party's thresholds", () => {
    assert.equal(healthTone(0.8), "good");
    assert.equal(healthTone(0.5), "warn");
    assert.equal(healthTone(0.2), "danger");
  });
});
