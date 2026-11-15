import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPOSITION } from "../scripts/constants/module-constants.js";
import { applyDefeatedLook, defeatedGroupOf, defeatedLook, removedWhenDefeated } from "../scripts/helpers/defeated-look.js";
import CombatantAdapter from "../scripts/services/CombatantAdapter.js";
import CombatProjector from "../scripts/services/CombatProjector.js";
import PhaseProjector from "../scripts/services/PhaseProjector.js";

describe("defeated look (#15)", () => {
  it("shows the skull and the grey together by default, as before", () => {
    assert.deepEqual(defeatedLook({ defeated: true, down: false }), { shown: true, skull: true, grey: true });
    assert.deepEqual(defeatedLook({ defeated: false, down: true }), { shown: true, skull: true, grey: true });
    assert.deepEqual(defeatedLook({ defeated: false, down: false }), { shown: false, skull: false, grey: false });
  });

  it("lets the skull and the grey go apart, or both", () => {
    const flagged = { defeated: true, down: false };
    assert.deepEqual(defeatedLook(flagged, { look: "skull" }), { shown: true, skull: true, grey: false });
    assert.deepEqual(defeatedLook(flagged, { look: "grey" }), { shown: true, skull: false, grey: true });
    assert.deepEqual(defeatedLook(flagged, { look: "none" }), { shown: true, skull: false, grey: false });
  });

  it("follows the chosen trigger: the defeated mark, 0 hit points, or either", () => {
    const atZero = { defeated: false, down: true };
    const marked = { defeated: true, down: false };
    assert.equal(defeatedLook(atZero, { trigger: "flag" }).shown, false, "0 hit points is not dead");
    assert.equal(defeatedLook(marked, { trigger: "flag" }).shown, true);
    assert.equal(defeatedLook(atZero, { trigger: "hp" }).shown, true);
    assert.equal(defeatedLook(marked, { trigger: "hp" }).shown, false);
    assert.equal(defeatedLook(atZero, { trigger: "either" }).shown, true);
  });

  it("splits player characters, companions and summons included, from NPCs by ownership", () => {
    assert.equal(defeatedGroupOf({ hasPlayerOwner: true }), "pc");
    assert.equal(defeatedGroupOf({ hasPlayerOwner: false }), "npc");
  });

  it("marks a slice only while there is a look to show", () => {
    const classes = new Set();
    const element = { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } };
    applyDefeatedLook(element, { defeatedSkull: true, defeatedGrey: false });
    assert.deepEqual([...classes].sort(), ["is-defeated", "is-defeated-skull"]);
    applyDefeatedLook(element, { dead: true, defeatedSkull: false, defeatedGrey: false });
    assert.deepEqual([...classes], [], "with no look it reads like anyone else");
  });
});

/** A Combatant-shaped object with only what the adapter reads. */
function combatant(id, { hp = 0, defeated = false, owned = false, disposition = DISPOSITION.HOSTILE } = {}) {
  return {
    id,
    name: id,
    initiative: 10,
    hidden: false,
    isDefeated: defeated,
    isOwner: owned,
    hasPlayerOwner: owned,
    players: [],
    img: null,
    flags: {},
    token: { disposition, texture: { src: `tokens/${id}.webp` }, getBarAttribute: () => ({ type: "bar", value: hp, max: 10 }) },
    actor: { img: null, flags: {}, temporaryEffects: [] },
  };
}

const defaults = { portraitSource: "token", hpForPlayers: "state", npcNames: "always", defeatedMode: "fade", concealment: "hidden" };
const context = (isGM, defeatedLook, extra = {}) => ({ isGM, settings: { ...defaults, ...extra, defeatedLook }, unknownName: "Unknown", round: 1 });
const policy = {
  npc: { look: "skull", trigger: "either" },
  pc: { look: "none", trigger: "flag" },
};

describe("CombatantAdapter with the defeated look (#15)", () => {
  it("applies each side's look and trigger", () => {
    const npc = CombatantAdapter.toViewModel(combatant("orc"), context(true, policy));
    assert.equal(npc.defeatedSkull, true);
    assert.equal(npc.defeatedGrey, false);
    const pc = CombatantAdapter.toViewModel(combatant("hero", { owned: true, disposition: DISPOSITION.FRIENDLY }), context(true, policy));
    assert.equal(pc.dead, false, "a character at 0 is not marked defeated");
    assert.equal(pc.defeatedSkull || pc.defeatedGrey, false);
  });

  it("keeps the look as every table had it without the new settings", () => {
    const vm = CombatantAdapter.toViewModel(combatant("orc"), context(true, undefined));
    assert.equal(vm.defeatedSkull && vm.defeatedGrey, true);
  });

  it("never shows 0 hit points a player may not know", () => {
    const vm = CombatantAdapter.toViewModel(combatant("orc"), context(false, { npc: { look: "skullGrey", trigger: "hp" } }, { hpForPlayers: "hidden" }));
    assert.equal(vm.dead, false);
  });

  it("changes nothing that decides who stays on the wheel", () => {
    const turns = [combatant("orc"), combatant("hero", { owned: true, disposition: DISPOSITION.FRIENDLY })];
    const removing = { ...context(true, { npc: { look: "none" }, pc: { look: "none" } }), settings: { ...defaults, defeatedMode: "remove", defeatedLook: { npc: { look: "none" }, pc: { look: "none" } } } };
    const model = CombatProjector.project({ id: "c1", round: 1, turn: 0, started: true, turns }, removing);
    assert.equal(model.N, 0, "removing the dead still follows its own rule");
    const vm = CombatantAdapter.toViewModel(combatant("orc"), context(true, { npc: { look: "none" } }));
    assert.equal(vm.dead, true);
  });
});

describe("removing the defeated, NPCs only or everyone (#16)", () => {
  const ring = (turns, { defeatedMode, isGM = true, look, extra = {}, turn = 0 }) =>
    CombatProjector.project({ id: "c1", round: 1, turn, started: true, turns }, context(isGM, look, { ...extra, defeatedMode }));
  const ids = (model) => model.ring.map((vm) => vm.id);
  const orc = () => combatant("orc");
  const hero = () => combatant("hero", { owned: true, disposition: DISPOSITION.FRIENDLY });
  const wolf = () => combatant("wolf", { owned: true, disposition: DISPOSITION.FRIENDLY }); // a player's companion
  const goblin = () => combatant("goblin", { hp: 7 });

  it("reads the stored modes as before, with NPCs only in between", () => {
    assert.equal(removedWhenDefeated("fade", { hasPlayerOwner: false }), false);
    assert.equal(removedWhenDefeated("remove", { hasPlayerOwner: true }), true);
    assert.equal(removedWhenDefeated("removeNpcs", { hasPlayerOwner: false }), true);
    assert.equal(removedWhenDefeated("removeNpcs", { hasPlayerOwner: true }), false);
  });

  it("removes defeated NPCs and keeps player characters, companions and summons included", () => {
    assert.deepEqual(ids(ring([orc(), hero(), wolf(), goblin()], { defeatedMode: "removeNpcs" })), ["hero", "wolf", "goblin"]);
    assert.deepEqual(ids(ring([orc(), hero(), wolf(), goblin()], { defeatedMode: "remove" })), ["goblin"]);
    assert.deepEqual(ids(ring([orc(), hero(), goblin()], { defeatedMode: "fade" })), ["orc", "hero", "goblin"]);
  });

  it("follows each side's trigger: a character at 0 without the defeated mark stays", () => {
    const look = { npc: { trigger: "either" }, pc: { trigger: "flag" } };
    assert.deepEqual(ids(ring([orc(), hero(), goblin()], { defeatedMode: "remove", look })), ["hero", "goblin"]);
    const marked = combatant("hero", { owned: true, defeated: true, disposition: DISPOSITION.FRIENDLY });
    assert.deepEqual(ids(ring([marked, goblin()], { defeatedMode: "remove", look })), ["goblin"]);
  });

  it("brings a combatant back once it is no longer defeated", () => {
    assert.deepEqual(ids(ring([combatant("orc", { hp: 3 }), goblin()], { defeatedMode: "removeNpcs" })), ["orc", "goblin"]);
  });

  it("never removes on hit points a player may not know", () => {
    const model = ring([orc(), goblin()], { defeatedMode: "removeNpcs", isGM: false, extra: { hpForPlayers: "hidden" } });
    assert.deepEqual(ids(model), ["orc", "goblin"]);
  });

  it("keeps Foundry's turn order when the acting combatant is removed: the wheel waits on the next one", () => {
    const model = ring([goblin(), orc(), hero()], { defeatedMode: "removeNpcs", turn: 1 });
    assert.deepEqual(ids(model), ["goblin", "hero"]);
    assert.equal(model.turn, 1);
    assert.equal(model.activeHidden, true);
    assert.equal(model.current.id, "hero");
  });
});

describe("SC Venaerys's phases keep Foundry's defeated mark (#16)", () => {
  const V = "sc-venaerys-initiative";
  const phase = (id) => ({ id, type: id, nameKey: `P.${id}`, name: null, icon: `fa-solid fa-${id}`, color: "#5b86c9" });
  const plan = [phase("fast"), phase("enemies"), phase("slow")];
  const member = (id, options) => ({ ...combatant(id, options), flags: { [V]: { phase: "fast" } } });
  const project = (turns, look) =>
    PhaseProjector.project(
      { id: "c1", round: 1, turn: 0, turns, flags: { [V]: { enabled: true, plan } } },
      { ...context(false, look), localize: (key) => key, waitingName: "Waiting" },
    );

  it("counts a member marked defeated as Venaerys does, whatever the display trigger says", () => {
    const hero = member("hero", { owned: true, defeated: true, hp: 8, disposition: DISPOSITION.FRIENDLY });
    const model = project([hero], { pc: { trigger: "hp" } });
    const [vm] = model.phase.acting;
    assert.equal(vm.status, "defeated");
    assert.equal(vm.dead, false, "not shown as defeated: the table counts 0 hit points only");
    assert.equal(model.current.finishedCount, 1);
    assert.equal(model.canEndOwnTurn, false, "nothing left to finish");
  });

  it("leaves a member at 0 without the mark acting, as Venaerys does, while it may look defeated", () => {
    const hero = member("hero", { owned: true, hp: 0, disposition: DISPOSITION.FRIENDLY });
    const model = project([hero], { pc: { trigger: "either" } });
    const [vm] = model.phase.acting;
    assert.equal(vm.status, "acting");
    assert.equal(vm.dead, true);
    assert.equal(vm.defeatedSkull, true);
    assert.equal(model.canEndOwnTurn, true, "its player can still end the phase");
  });
});
