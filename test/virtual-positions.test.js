import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_VIRTUAL_IMAGE,
  canAutoAdvance,
  combatantDataFor,
  configFor,
  normalizeTemplate,
  virtualFlagOf,
} from "../scripts/helpers/virtual-positions.js";

describe("normalizeTemplate (RF-61)", () => {
  it("types and defaults every field", () => {
    const t = normalizeTemplate({ id: "lair", name: "  Ação de covil ", initiative: "20", hidden: 1 });
    assert.deepEqual(t, {
      id: "lair", name: "Ação de covil", img: DEFAULT_VIRTUAL_IMAGE, initiative: 20, hidden: true,
      autoAdvance: false, autoAdd: false, consequences: [],
    });
  });

  it("turns the old single hook and macro into consequences", () => {
    const t = normalizeTemplate({ id: "old", hook: "lairAction", macroUuid: "Macro.abc" });
    assert.deepEqual(t.consequences.map((c) => [c.kind, Object.values(c.params)[0]]), [["hook", "lairAction"], ["macro", "Macro.abc"]]);
  });

  it("never produces an unusable initiative or empty name", () => {
    const t = normalizeTemplate({ initiative: "abc", name: " " });
    assert.equal(t.initiative, 20);
    assert.equal(t.name, "?");
    assert.ok(t.id);
  });
});

describe("combatantDataFor (RF-60)", () => {
  it("creates a token-less combatant with its config in the flag", () => {
    const data = combatantDataFor({
      id: "lair", name: "Covil", initiative: 20, autoAdvance: true,
      consequences: [{ kind: "hook", params: { name: "lairAction" } }],
    });
    assert.equal(data.name, "Covil");
    assert.equal(data.initiative, 20);
    assert.equal(data.tokenId, undefined);
    assert.equal(data.actorId, undefined);
    const flag = data.flags["sc-combat-wheel"].virtual;
    assert.equal(flag.templateId, "lair");
    assert.equal(flag.consequences[0].params.name, "lairAction");
    assert.equal(virtualFlagOf(data), flag);
  });

  it("is not confused with ordinary combatants", () => {
    assert.equal(virtualFlagOf({ flags: {} }), null);
    assert.equal(virtualFlagOf(null), null);
  });
});

describe("configFor", () => {
  const flag = { templateId: "lair", name: "Old", initiative: 20, consequences: [{ kind: "hook", params: { name: "old" } }] };
  const hookOf = (config) => config.consequences[0].params.name;

  it("follows the template when it still exists", () => {
    const template = normalizeTemplate({ id: "lair", name: "New", consequences: [{ kind: "hook", params: { name: "new" } }] });
    assert.equal(hookOf(configFor(flag, [template])), "new");
  });

  it("falls back to the snapshot when the template was deleted", () => {
    const config = configFor(flag, []);
    assert.equal(hookOf(config), "old");
    assert.equal(config.id, "lair");
  });
});

describe("canAutoAdvance (RF-65)", () => {
  it("stops after a whole lap of virtual positions", () => {
    assert.equal(canAutoAdvance(0, 3), true);
    assert.equal(canAutoAdvance(2, 3), true);
    assert.equal(canAutoAdvance(3, 3), false);
    assert.equal(canAutoAdvance(0, 0), true);
  });
});
