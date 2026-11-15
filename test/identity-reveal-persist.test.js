import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { installFoundryStubs, registered } from "./helpers/foundry-stub.js";
import { DISPOSITION, MODULE_ID, SETTINGS } from "../scripts/constants/module-constants.js";
import { IDENTITY_REVEALED_FLAG, revealSkipRule } from "../scripts/helpers/identity-reveal.js";

installFoundryStubs();

const values = {
  [SETTINGS.concealEnemyIdentity]: true,
  [SETTINGS.skipDead]: "npcs",
  [SETTINGS.concealment]: "tokenHidden",
  [SETTINGS.hpSource]: "bar1",
  [SETTINGS.npcNames]: "always",
  [SETTINGS.hpForPlayers]: "state",
  [SETTINGS.portraitSource]: "token",
  [SETTINGS.cameraFollows]: true,
  [SETTINGS.soundsAllowed]: false,
  [SETTINGS.soundTurnBack]: "off",
};
game.settings.get = (scope, key) => values[key];
game.user.isGM = true;
game.users.activeGM = { isSelf: true };

const { default: IdentityReveal } = await import("../scripts/services/IdentityReveal.js");
const { default: TurnSideEffects } = await import("../scripts/services/TurnSideEffects.js");
const { default: TurnAnnouncer } = await import("../scripts/services/TurnAnnouncer.js");
const { default: TokenInteractions } = await import("../scripts/services/TokenInteractions.js");
IdentityReveal.install();

/** Fires a hook the module registered, then lets its microtask run. */
async function fire(name, ...args) {
  for (const handler of registered.on.get(name) ?? []) handler(...args);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A combatant with what the projection and the reveal read; `writes` counts its flag updates. */
function combatant(id, { hidden = false, tokenHidden = false, hp = 10 } = {}) {
  const flags = { [MODULE_ID]: {} };
  const self = {
    id,
    uuid: `Combat.c1.Combatant.${id}`,
    name: `Goblin ${id}`,
    tokenId: `token-${id}`,
    initiative: 10,
    hidden,
    isDefeated: false,
    isOwner: false,
    hasPlayerOwner: false,
    players: [],
    flags,
    writes: 0,
    token: { id: `token-${id}`, disposition: DISPOSITION.HOSTILE, hidden: tokenHidden, texture: { src: "" }, getBarAttribute: () => ({ type: "bar", value: hp, max: 10 }) },
    actor: { id: `actor-${id}`, img: null, flags: {}, temporaryEffects: [], statuses: new Set() },
    getFlag: (scope, key) => flags[scope]?.[key],
    setFlag: async (scope, key, value) => {
      self.writes += 1;
      flags[scope][key] = value;
    },
  };
  return self;
}

function combatOf(turns, turn = 0) {
  const combat = { id: "c1", round: 1, turn, started: true, turns, flags: {} };
  combat.combatants = { contents: turns, get: (id) => turns.find((c) => c.id === id) };
  Object.defineProperty(combat, "combatant", { get: () => combat.turns[combat.turn] ?? null });
  for (const c of turns) c.parent = combat;
  return combat;
}

const revealed = (c) => c.flags[MODULE_ID][IDENTITY_REVEALED_FLAG] === true;
const forward = { round: 1, turn: -1 };

describe("recording a reveal (#14)", () => {
  beforeEach(() => {
    values[SETTINGS.concealEnemyIdentity] = true;
  });

  it("records the acting foe on its turn, once", async () => {
    const foe = combatant("a");
    const combat = combatOf([foe]);
    game.combats = [combat];
    IdentityReveal.onTurnChanged(combat, forward);
    IdentityReveal.onTurnChanged(combat, forward);
    await fire("updateToken", foe.token, { hidden: false });
    assert.equal(revealed(foe), true);
    assert.equal(foe.writes, 1, "a write already under way is not repeated");
  });

  it("records a foe hidden when its turn came once the GM shows it during that turn", async () => {
    const foe = combatant("a", { hidden: true });
    const combat = combatOf([foe]);
    game.combats = [combat];
    IdentityReveal.onTurnChanged(combat, forward);
    assert.equal(revealed(foe), false, "players saw nothing");
    foe.hidden = false;
    await fire("updateCombatant", foe, { hidden: false });
    assert.equal(revealed(foe), true);
  });

  it("does the same for a hidden token, when hidden tokens conceal", async () => {
    const foe = combatant("a", { tokenHidden: true });
    const combat = combatOf([foe]);
    game.combats = [combat];
    IdentityReveal.onTurnChanged(combat, forward);
    assert.equal(revealed(foe), false);
    foe.token.hidden = false;
    await fire("updateToken", foe.token, { hidden: false });
    assert.equal(revealed(foe), true);
  });

  it("leaves a foe shown outside its own turn unknown", async () => {
    const acting = combatant("a");
    const waiting = combatant("b", { hidden: true });
    const combat = combatOf([acting, waiting]);
    game.combats = [combat];
    waiting.hidden = false;
    await fire("updateCombatant", waiting, { hidden: false });
    assert.equal(revealed(waiting), false);
  });

  it("leaves a dead foe the skip passes over unknown, shown or not, but not one reached going back", async () => {
    const dead = combatant("a", { hidden: true, hp: 0 });
    const combat = combatOf([dead]);
    game.combats = [combat];
    IdentityReveal.onTurnChanged(combat, forward);
    dead.hidden = false;
    await fire("updateCombatant", dead, { hidden: false });
    assert.equal(revealed(dead), false);
    IdentityReveal.onTurnChanged(combat, { round: 2, turn: 0 });
    await fire("updateToken", dead.token, { hidden: false });
    assert.equal(revealed(dead), true, "a step back does not skip");
  });

  it("records whoever acts when the option is turned on in the middle of their turn", async () => {
    values[SETTINGS.concealEnemyIdentity] = "off";
    const foe = combatant("a");
    const combat = combatOf([foe]);
    game.combats = [combat];
    IdentityReveal.onTurnChanged(combat, forward);
    assert.equal(revealed(foe), false, "nothing to record while off");
    values[SETTINGS.concealEnemyIdentity] = "placeholder";
    await fire("updateSetting", { key: `${MODULE_ID}.${SETTINGS.concealEnemyIdentity}` });
    assert.equal(revealed(foe), true);
  });

  it("records nothing with the option off", async () => {
    values[SETTINGS.concealEnemyIdentity] = false;
    const foe = combatant("a");
    const combat = combatOf([foe]);
    game.combats = [combat];
    IdentityReveal.onTurnChanged(combat, forward);
    await fire("updateCombatant", foe, { hidden: false });
    assert.equal(revealed(foe), false);
  });

  it("judges the dead-turn skip as the skip and the players' projection do", () => {
    assert.equal(revealSkipRule({ phased: true, forward: true, skipDead: "never" }), "all");
    assert.equal(revealSkipRule({ phased: false, forward: false, skipDead: "all" }), "never");
    assert.equal(revealSkipRule({ phased: false, forward: true, skipDead: "npcs" }), "npcs");
    assert.equal(revealSkipRule({ phased: false, forward: null, skipDead: "npcs" }), "npcs", "a change in the middle of a turn");
  });
});

describe("the camera and unknown foes (#14)", () => {
  it("does not follow the turn to a combatant players see as unknown", () => {
    const panned = [];
    TokenInteractions.panToCombatant = (combat, id) => panned.push(id);
    TurnAnnouncer.onTurnChanged = () => false;
    const model = (vm) => ({ started: true, current: vm, nextUp: null, activeHidden: false });
    TurnSideEffects.onTurnChanged({}, model({ id: "a", identityHidden: true }), forward);
    TurnSideEffects.onTurnChanged({}, model({ id: "b", identityHidden: false }), forward);
    assert.deepEqual(panned, ["b"]);
  });
});
