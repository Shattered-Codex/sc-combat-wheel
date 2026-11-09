import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPOSITION, TOKEN_DISPLAY } from "../scripts/constants/module-constants.js";
import CombatProjector from "../scripts/services/CombatProjector.js";
import CombatantAdapter from "../scripts/services/CombatantAdapter.js";

/** A Combatant-shaped object with only what the adapter reads. */
function combatant(id, overrides = {}) {
  const {
    hp = { value: 10, max: 10 },
    disposition = DISPOSITION.HOSTILE,
    displayName = TOKEN_DISPLAY.NONE,
    effects = [],
    ...rest
  } = overrides;
  return {
    id,
    name: `Goblin ${id}`,
    initiative: 10,
    hidden: false,
    isDefeated: false,
    isOwner: false,
    hasPlayerOwner: false,
    players: [],
    img: null,
    token: {
      disposition,
      displayName,
      texture: { src: `tokens/${id}.webp` },
      getBarAttribute: () => (hp ? { type: "bar", value: hp.value, max: hp.max } : null),
    },
    actor: { img: `actors/${id}.webp`, flags: {}, temporaryEffects: effects },
    ...rest,
  };
}

const settings = {
  portraitSource: "token",
  hpForPlayers: "state",
  npcNames: "always",
  defeatedMode: "fade",
  secondsPerRound: 6,
};
const gm = { isGM: true, settings, unknownName: "Unknown" };
const player = { isGM: false, settings, unknownName: "Unknown" };
const combat = (turns, extra = {}) => ({ id: "c1", round: 1, turn: 0, started: true, turns, ...extra });

describe("CombatProjector ring", () => {
  it("follows combat.turns and anchors on the active combatant", () => {
    const model = CombatProjector.project(
      combat([combatant("a"), combatant("b"), combatant("c")], { round: 2, turn: 1 }),
      gm,
    );
    assert.deepEqual(model.ring.map((vm) => vm.id), ["a", "b", "c"]);
    assert.equal(model.current.id, "b");
    assert.equal(model.T, 4);
    assert.equal(model.turnLabel, "2/3");
  });

  it("hides hidden combatants from players but keeps them for the GM", () => {
    const turns = [combatant("a"), combatant("b", { hidden: true }), combatant("c")];
    assert.deepEqual(CombatProjector.project(combat(turns), gm).ring.map((vm) => vm.id), ["a", "b", "c"]);
    assert.deepEqual(CombatProjector.project(combat(turns), player).ring.map((vm) => vm.id), ["a", "c"]);
  });

  it("removes defeated combatants for everyone only in remove mode", () => {
    const turns = [combatant("a"), combatant("b", { isDefeated: true })];
    const fade = CombatProjector.project(combat(turns), gm);
    assert.equal(fade.ring.length, 2);
    assert.equal(fade.ring[1].defeated, true);
    const remove = CombatProjector.project(combat(turns), {
      ...gm,
      settings: { ...settings, defeatedMode: "remove" },
    });
    assert.deepEqual(remove.ring.map((vm) => vm.id), ["a"]);
  });
});

describe("CombatProjector hidden turn (RF-43)", () => {
  const turns = [combatant("a"), combatant("b", { hidden: true }), combatant("c")];

  it("anchors players on the next visible combatant and marks the wait", () => {
    const model = CombatProjector.project(combat(turns, { turn: 1 }), player);
    assert.equal(model.current.id, "c");
    assert.equal(model.activeHidden, true);
    assert.equal(model.canEndOwnTurn, false);
  });

  it("wraps into the next round when nobody visible is left", () => {
    const tail = [combatant("a"), combatant("b"), combatant("z", { hidden: true })];
    const model = CombatProjector.project(combat(tail, { round: 3, turn: 2 }), player);
    assert.equal(model.current.id, "a");
    assert.equal(model.T, 3 * 2 + 0, "round 4 of a two-combatant ring");
  });

  it("does not claim a wait before the combat starts", () => {
    const model = CombatProjector.project(combat(turns, { round: 0, turn: 1, started: false }), player);
    assert.equal(model.activeHidden, false);
  });
});

describe("CombatProjector initiative request (RF-15)", () => {
  const turns = [
    combatant("a", { initiative: 18 }),
    combatant("b", { initiative: null, isOwner: true, hasPlayerOwner: true }),
    combatant("c", { initiative: null }),
  ];

  it("asks for initiative in rounds 0 and 1 only", () => {
    assert.equal(CombatProjector.project(combat(turns, { round: 0, started: false }), gm).needsRoll, true);
    assert.equal(CombatProjector.project(combat(turns, { round: 1 }), gm).needsRoll, true);
    assert.equal(CombatProjector.project(combat(turns, { round: 2 }), gm).needsRoll, false);
  });

  it("counts who rolled and whose rolls this user may make", () => {
    const asGM = CombatProjector.project(combat(turns), gm);
    assert.equal(asGM.rolledCount, 1);
    assert.deepEqual(asGM.pendingOwnIds, ["b", "c"]);
    const asPlayer = CombatProjector.project(combat(turns), player);
    assert.deepEqual(asPlayer.pendingOwnIds, ["b"]);
  });
});

describe("CombatProjector own focus before the start", () => {
  const turns = [
    combatant("a", { initiative: 18 }),
    combatant("b", { initiative: 12, isOwner: true }),
    combatant("c", { initiative: null, isOwner: true }),
    combatant("d", { initiative: null }),
  ];
  const setup = combat(turns, { round: 0, turn: 0, started: false });

  it("rests a player's wheel on their first combatant still to roll", () => {
    const model = CombatProjector.project(setup, player);
    assert.equal(model.current.id, "c");
    assert.equal(model.focusOwn, true);
    assert.equal(model.T, 2);
  });

  it("falls back on their combatant that already rolled", () => {
    const rolled = combat([combatant("a"), combatant("b", { isOwner: true })], { round: 0, started: false });
    assert.equal(CombatProjector.project(rolled, player).current.id, "b");
  });

  it("leaves the GM, a player with nobody, and a started combat on the turn", () => {
    assert.equal(CombatProjector.project(setup, gm).current.id, "a");
    assert.equal(CombatProjector.project(setup, gm).focusOwn, false);
    const strangers = combat([combatant("a"), combatant("d")], { round: 0, started: false });
    assert.equal(CombatProjector.project(strangers, player).current.id, "a");
    assert.equal(CombatProjector.project(combat(turns), player).current.id, "a");
  });
});

describe("CombatProjector end own turn", () => {
  it("lets the owner of the active combatant end the turn", () => {
    const turns = [combatant("a", { isOwner: true }), combatant("b")];
    assert.equal(CombatProjector.project(combat(turns), player).canEndOwnTurn, true);
    assert.equal(CombatProjector.project(combat(turns, { turn: 1 }), player).canEndOwnTurn, false);
  });
});

describe("CombatProjector stats", () => {
  it("sums hit points by side for the GM only", () => {
    const turns = [
      combatant("a", { disposition: DISPOSITION.FRIENDLY, hp: { value: 5, max: 10 } }),
      combatant("b", { hp: { value: 0, max: 7 } }),
    ];
    const asGM = CombatProjector.project(combat(turns, { round: 3 }), gm);
    assert.deepEqual(asGM.stats.hpBySide, { friendly: { value: 5, max: 10 }, hostile: { value: 0, max: 7 } });
    assert.equal(asGM.stats.standing, 1);
    assert.equal(asGM.stats.elapsedSeconds, 12);
    assert.equal(CombatProjector.project(combat(turns), player).stats.hpBySide, null);
  });

  it("lists effects that expire this round", () => {
    const effects = [
      { name: "Bless", img: "bless.webp", duration: { rounds: 3, startRound: 1 } },
      { name: "Haste", img: "haste.webp", duration: { rounds: 10, startRound: 1 } },
    ];
    const model = CombatProjector.project(combat([combatant("a", { effects })], { round: 4 }), gm);
    assert.deepEqual(model.stats.expiring.map((e) => e.name), ["Bless"]);
  });
});

describe("CombatantAdapter", () => {
  it("shows exact hit points to owners and the GM, the band to other players", () => {
    const wounded = combatant("a", { hp: { value: 4, max: 10 } });
    assert.equal(CombatantAdapter.toViewModel(wounded, { ...gm, round: 1 }).hp.text, "4/10");
    const asPlayer = CombatantAdapter.toViewModel(wounded, { ...player, round: 1 }).hp;
    assert.equal(asPlayer.mode, "state");
    assert.equal(asPlayer.stateKey, "bloodied");
    assert.equal(asPlayer.text, undefined);
  });

  it("shows exact hit points of friendly combatants to every player", () => {
    const ally = combatant("a", { disposition: DISPOSITION.FRIENDLY, hp: { value: 4, max: 10 } });
    assert.equal(CombatantAdapter.toViewModel(ally, { ...player, round: 1 }).hp.text, "4/10");
  });

  it("hides names the token does not display, only in token mode", () => {
    const hidden = combatant("a", { displayName: TOKEN_DISPLAY.OWNER });
    const tokenMode = { ...player, round: 1, settings: { ...settings, npcNames: "token" } };
    assert.equal(CombatantAdapter.toViewModel(hidden, tokenMode).name, "Unknown");
    assert.equal(CombatantAdapter.toViewModel(hidden, { ...player, round: 1 }).name, "Goblin a");
    const shown = combatant("b", { displayName: TOKEN_DISPLAY.HOVER });
    assert.equal(CombatantAdapter.toViewModel(shown, tokenMode).name, "Goblin b");
  });

  it("never exposes raw hit points to players", () => {
    assert.equal(CombatantAdapter.toViewModel(combatant("a"), { ...player, round: 1 }).hpTotal, null);
  });

  it("picks the portrait source with fallbacks, skipping video", () => {
    const c = combatant("a");
    assert.equal(CombatantAdapter.portraitFor(c, "token").src, "tokens/a.webp");
    assert.equal(CombatantAdapter.portraitFor(c, "actor").src, "actors/a.webp");
    c.actor.flags["sc-combat-wheel"] = { portrait: { src: "art/a.webp", position: "50% 0%" } };
    assert.deepEqual(CombatantAdapter.portraitFor(c, "flag"), { src: "art/a.webp", position: "50% 0%" });
    const isVideo = (src) => src.endsWith(".webm");
    c.token.texture.src = "tokens/a.webm";
    assert.equal(CombatantAdapter.portraitFor(c, "token", isVideo).src, "actors/a.webp");
  });

  it("shows players a character's own art only when Foundry already shows it to them (RF-117)", () => {
    const actorSource = { ...player, round: 1, settings: { ...settings, portraitSource: "actor" } };
    const stranger = combatant("a");
    stranger.actor.permission = 0;
    assert.equal(CombatantAdapter.toViewModel(stranger, actorSource).img, "tokens/a.webp", "a disguise stays a disguise");
    const known = combatant("b");
    known.actor.permission = 1;
    assert.equal(CombatantAdapter.toViewModel(known, actorSource).img, "actors/b.webp", "Limited shows the portrait");
    assert.equal(CombatantAdapter.toViewModel(stranger, { ...actorSource, isGM: true }).img, "actors/a.webp", "the GM sees everything");
    stranger.actor.flags["sc-combat-wheel"] = { portrait: "art/a.webp" };
    assert.equal(CombatantAdapter.portraitFor(stranger, "flag", undefined, { revealActor: false }).src, "tokens/a.webp");
  });

  it("names the player whose announcement card a turn shows (RF-123)", () => {
    const owners = [{ id: "u1", name: "Ana", character: { id: "other" } }, { id: "u2", name: "Bia", character: { id: "hero" } }];
    const hero = combatant("a", { players: owners, actor: { id: "hero", img: "actors/a.webp", flags: {}, temporaryEffects: [] } });
    assert.equal(CombatantAdapter.toViewModel(hero, { ...player, round: 1 }).cardUserId, "u2", "the player whose character it is");
    const shared = combatant("b", { players: owners });
    assert.equal(CombatantAdapter.toViewModel(shared, { ...player, round: 1 }).cardUserId, "u1", "else its first owner");
    assert.equal(CombatantAdapter.toViewModel(combatant("c"), { ...player, round: 1 }).cardUserId, null, "an NPC has none");
  });

  it("never falls back from a video token to art the player may not see (RF-117)", () => {
    const isVideo = (src) => src.endsWith(".webm");
    const stranger = combatant("a");
    stranger.actor.permission = 0;
    stranger.token.texture.src = "tokens/a.webm";
    assert.equal(CombatantAdapter.portraitFor(stranger, "token", isVideo, { revealActor: false }).src, null, "initials, not the disguise's secret");
    assert.equal(CombatantAdapter.portraitFor(stranger, "token", isVideo, { revealActor: true }).src, "actors/a.webp");
    const seen = CombatantAdapter.toViewModel(stranger, { ...player, round: 1, isVideo });
    assert.deepEqual([seen.img, seen.tokenImg, seen.artImg], [null, null, null], "no field of the view model leaks it");
    const byGM = CombatantAdapter.toViewModel(stranger, { ...gm, round: 1, isVideo });
    assert.deepEqual([byGM.img, byGM.tokenImg, byGM.artImg], ["actors/a.webp", "actors/a.webp", "actors/a.webp"]);
  });
});

describe("CombatProjector virtual positions (RF-66)", () => {
  const lair = (id) =>
    combatant(id, { initiative: 20, token: null, actor: null, flags: { "sc-combat-wheel": { virtual: { templateId: "lair" } } } });

  it("keeps them on the ring but out of rolls and stats", () => {
    const turns = [lair("v"), combatant("a", { initiative: null }), combatant("b")];
    const model = CombatProjector.project(combat(turns), gm);
    assert.equal(model.ring[0].virtual, true);
    assert.equal(model.N, 3);
    assert.equal(model.rollTotal, 2);
    assert.equal(model.rolledCount, 1);
    assert.deepEqual(model.pendingOwnIds, ["a"]);
    assert.equal(model.stats.total, 2);
  });
});
