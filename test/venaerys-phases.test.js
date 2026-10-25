import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentHalfOf,
  currentPhaseIdOf,
  isValidPlan,
  memberProgress,
  phaseName,
  phasePlanOf,
  phasePositionOf,
} from "../scripts/helpers/venaerys-phases.js";

const V = "sc-venaerys-initiative";
const phase = (id, type = id, extra = {}) => ({ id, type, nameKey: `P.${id}`, name: null, icon: "fa-solid fa-bolt", color: "#5b86c9", ...extra });
const PLAN = [phase("boss", "creatures"), phase("fast"), phase("enemies"), phase("slow")];
const member = (phaseId, extra = {}) => ({ flags: { [V]: { phase: phaseId, ...extra } } });
const combat = ({ plan = PLAN, enabled = true, round = 1, turn = 0, turns = [member("fast")], flags = {} } = {}) => ({
  round,
  turn,
  turns,
  flags: { [V]: { enabled, plan, ...flags } },
});

describe("Venaerys plan (RF-80)", () => {
  it("accepts Venaerys's plan and refuses what it would refuse", () => {
    assert.equal(isValidPlan(PLAN), true);
    assert.equal(isValidPlan([phase("fast"), phase("slow"), phase("enemies")]), false, "Slow before Enemies");
    assert.equal(isValidPlan([phase("fast"), phase("enemies")]), false, "Slow missing");
    assert.equal(isValidPlan([...PLAN, phase("boss", "creatures")]), false, "repeated id");
    assert.equal(isValidPlan([phase("fast", "fast", { color: "red" }), phase("enemies"), phase("slow")]), false, "bad color");
    assert.equal(isValidPlan([phase("x", "fast"), phase("enemies"), phase("slow")]), false, "built-in under another id");
  });

  it("only reads a plan while the combat is switched to phases", () => {
    assert.equal(phasePlanOf(combat()), PLAN);
    assert.equal(phasePlanOf(combat({ enabled: false })), null);
    assert.equal(phasePlanOf(combat({ plan: "nope" })), null);
    assert.equal(phasePlanOf({ flags: {} }), null);
  });

  it("finds the phase under the pointer, and none before the start", () => {
    const running = combat({ turns: [member("boss"), member("fast")], turn: 1 });
    assert.equal(currentPhaseIdOf(running), "fast");
    assert.equal(phasePositionOf(running), "1:fast");
    assert.equal(currentPhaseIdOf(combat({ round: 0 })), null);
    assert.equal(currentPhaseIdOf(combat({ turns: [member(null)] })), null);
  });

  it("splits only the phases the combat's mode names, never event phases", () => {
    const players = combat({ flags: { split: "players" } });
    assert.equal(currentHalfOf(players, PLAN[1]), "move");
    assert.equal(currentHalfOf(players, PLAN[0]), null);
    assert.equal(currentHalfOf(combat({ flags: { split: "all", actionsHalf: "1:boss" } }), PLAN[0]), "act");
    assert.equal(currentHalfOf(combat({ flags: { split: "all" } }), phase("lair", "event")), null);
  });

  it("counts a member done for this round only, and moved as done in the movement half", () => {
    assert.equal(memberProgress(member("fast", { done: 2 }), { round: 2, half: null }), "done");
    assert.equal(memberProgress(member("fast", { done: 1 }), { round: 2, half: null }), "acting");
    assert.equal(memberProgress(member("fast", { moved: 2 }), { round: 2, half: "move" }), "done");
    assert.equal(memberProgress(member("fast", { moved: 2 }), { round: 2, half: "act" }), "acting");
  });

  it("shows the GM's own name, else Venaerys's translated default", () => {
    assert.equal(phaseName(phase("boss", "creatures", { name: "Dragão" }), () => "x"), "Dragão");
    assert.equal(phaseName(PLAN[1], (key) => `t:${key}`), "t:P.fast");
  });
});
