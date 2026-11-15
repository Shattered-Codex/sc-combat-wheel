import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_VIRTUAL_IMAGE,
  canAutoAdvance,
  combatantDataFor,
  configFor,
  isGmOnlyCombatant,
  normalizeTemplate,
  trustedInlineScript,
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
    assert.deepEqual(t.consequences.map((c) => [c.kind, c.params.name ?? c.params.macroUuid]), [["hook", "lairAction"], ["macro", "Macro.abc"]]);
    assert.equal(t.consequences[1].params.source, "macro");
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

  it("drops the snapshot's consequences when a player could have written them", () => {
    const config = configFor(flag, [], { trustSnapshot: false });
    assert.deepEqual(config.consequences, []);
    assert.equal(config.name, "Old");
    const template = normalizeTemplate({ id: "lair", consequences: [{ kind: "hook", params: { name: "new" } }] });
    assert.equal(hookOf(configFor(flag, [template], { trustSnapshot: false })), "new", "the GM's template still applies");
  });

  it("trusts only combatants without an actor, which players never own", () => {
    assert.equal(isGmOnlyCombatant({ actorId: null, actor: null }), true);
    assert.equal(isGmOnlyCombatant({ actorId: "a1", actor: { id: "a1" } }), false);
    assert.equal(isGmOnlyCombatant({ actorId: "gone", actor: null }), false, "an actor that once was there");
  });
});

describe("trustedInlineScript (inline macro consequences)", () => {
  const row = { id: "r1", kind: "macro", enabled: true, params: { source: "inline", macroUuid: "", script: "game.togglePause();" } };
  const templates = [normalizeTemplate({ id: "lair", consequences: [row] })];

  it("returns the script the saved template holds for that row", () => {
    assert.equal(trustedInlineScript(templates, "lair", "r1"), "game.togglePause();");
  });

  it("returns nothing for a row or template the world setting does not hold", () => {
    assert.equal(trustedInlineScript(templates, "forged", "r1"), null);
    assert.equal(trustedInlineScript(templates, "lair", "r2"), null);
    assert.equal(trustedInlineScript([], "lair", "r1"), null);
  });

  it("returns nothing when the saved row is off or runs a world macro", () => {
    const off = [normalizeTemplate({ id: "lair", consequences: [{ ...row, enabled: false }] })];
    const world = [normalizeTemplate({ id: "lair", consequences: [{ ...row, params: { ...row.params, source: "macro" } }] })];
    assert.equal(trustedInlineScript(off, "lair", "r1"), null);
    assert.equal(trustedInlineScript(world, "lair", "r1"), null);
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
