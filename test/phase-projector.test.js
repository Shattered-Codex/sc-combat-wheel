import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPOSITION } from "../scripts/constants/module-constants.js";
import PhaseProjector from "../scripts/services/PhaseProjector.js";

const V = "sc-venaerys-initiative";
const phase = (id, type = id) => ({ id, type, nameKey: `P.${id}`, name: null, icon: `fa-solid fa-${id}`, color: "#5b86c9" });
const PLAN = [phase("boss", "creatures"), phase("fast"), phase("enemies"), phase("slow")];

function combatant(id, phaseId, { owner = false, hidden = false, done = null, moved = null, defeated = false, disposition = DISPOSITION.HOSTILE } = {}) {
  return {
    id,
    name: id,
    initiative: 10,
    hidden,
    isDefeated: defeated,
    isOwner: owner,
    hasPlayerOwner: owner,
    players: [],
    img: null,
    flags: { [V]: { phase: phaseId, done, moved } },
    token: { disposition, displayName: 50, texture: { src: `tokens/${id}.webp` }, getBarAttribute: () => ({ type: "bar", value: 5, max: 10 }) },
    actor: { img: null, flags: {}, temporaryEffects: [] },
  };
}

const settings = { portraitSource: "token", hpForPlayers: "state", npcNames: "always", defeatedMode: "fade", concealment: "hidden", secondsPerRound: 6 };
const context = (isGM) => ({ isGM, settings, unknownName: "?", localize: (key) => key.replace("P.", ""), waitingName: "Waiting" });
const combat = (turns, { round = 2, turn = 0, flags = {} } = {}) => ({ id: "c1", round, turn, turns, flags: { [V]: { enabled: true, plan: PLAN, ...flags } } });

describe("PhaseProjector (RF-80)", () => {
  const turns = [
    combatant("dragon", "boss"),
    combatant("hero", "fast", { owner: true, disposition: DISPOSITION.FRIENDLY }),
    combatant("rogue", "fast", { owner: true, done: 2, disposition: DISPOSITION.FRIENDLY }),
    combatant("goblin", "enemies"),
    combatant("spy", "enemies", { hidden: true }),
  ];

  it("leaves unphased and unstarted combats to the ordinary wheel", () => {
    assert.equal(PhaseProjector.project({ ...combat(turns), flags: {} }, context(true)), null);
    assert.equal(PhaseProjector.project(combat(turns, { round: 0 }), context(true)), null);
  });

  it("rings the phases someone is in, turning one slice per phase", () => {
    const model = PhaseProjector.project(combat(turns, { turn: 1 }), context(true));
    assert.equal(model.phased, true);
    assert.deepEqual(model.ring.map((entry) => entry.phaseId), ["boss", "fast", "enemies"]);
    assert.equal(model.currentIndex, 1);
    assert.equal(model.T, 4, "round 2 of a three-phase ring, second phase");
    assert.equal(model.current.name, "fast");
    assert.equal(model.nextUp.phaseId, "enemies");
  });

  it("lists who acts in the current phase, with who already finished", () => {
    const { phase: current } = PhaseProjector.project(combat(turns, { turn: 1 }), context(true));
    assert.deepEqual(current.acting.map((m) => [m.id, m.status]), [["hero", "acting"], ["rogue", "done"]]);
    assert.equal(current.finishedCount, 1);
  });

  it("never shows a player the combatants or phases the tracker hides", () => {
    const everyoneHidden = [combatant("hero", "fast", { owner: true }), combatant("spy", "enemies", { hidden: true })];
    const model = PhaseProjector.project(combat(everyoneHidden, { turn: 1 }), context(false));
    assert.equal(model.ring.length, 2);
    const waiting = model.ring[1];
    assert.equal(waiting.waiting, true);
    assert.equal(waiting.name, "Waiting");
    assert.deepEqual(waiting.members, []);
    assert.equal(model.phase, null, "no strip for a phase the player sees no one in");
    const enemies = PhaseProjector.project(combat(turns, { turn: 3 }), context(false)).phase;
    assert.deepEqual(enemies.acting.map((m) => m.id), ["goblin"]);
  });

  it("offers a player Done while they still act, then Finished", () => {
    const acting = PhaseProjector.project(combat(turns, { turn: 1 }), context(false));
    assert.equal(acting.canEndOwnTurn, true);
    assert.equal(acting.ownFinished, false);
    const allDone = turns.map((c) => (c.id === "hero" ? combatant("hero", "fast", { owner: true, done: 2 }) : c));
    const finished = PhaseProjector.project(combat(allDone, { turn: 2 }), context(false));
    assert.equal(finished.canEndOwnTurn, false);
    assert.equal(finished.ownFinished, true);
    const elsewhere = PhaseProjector.project(combat(turns, { turn: 3 }), context(false));
    assert.equal(elsewhere.canEndOwnTurn, false);
    assert.equal(elsewhere.ownFinished, false);
  });

  it("counts moving as finishing the movement half", () => {
    const moving = [combatant("hero", "fast", { owner: true, moved: 2 })];
    const model = PhaseProjector.project(combat(moving, { flags: { split: "players" } }), context(false));
    assert.equal(model.phase.half, "move");
    assert.equal(model.phase.acting[0].status, "done");
    const acting = PhaseProjector.project(combat(moving, { flags: { split: "players", actionsHalf: "2:fast" } }), context(false));
    assert.equal(acting.phase.half, "act");
    assert.equal(acting.canEndOwnTurn, true);
  });

  it("shows the fallen as defeated, and drops them with the remove setting", () => {
    const withDead = [combatant("hero", "fast", { owner: true }), combatant("orc", "fast", { defeated: true })];
    const fade = PhaseProjector.project(combat(withDead), context(true));
    assert.equal(fade.phase.acting[1].status, "defeated");
    const remove = PhaseProjector.project(combat(withDead), { ...context(true), settings: { ...settings, defeatedMode: "remove" } });
    assert.deepEqual(remove.phase.acting.map((m) => m.id), ["hero"]);
  });
});
