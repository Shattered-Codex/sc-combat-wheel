import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPOSITION, MODULE_ID, TOKEN_DISPLAY } from "../scripts/constants/module-constants.js";
import {
  IDENTITY_REVEALED_FLAG,
  concealModeOf,
  isIdentityHidden,
  shouldRecordRevealed,
  unidentifiedViewModel,
  viewModelsById,
} from "../scripts/helpers/identity-reveal.js";
import { INITIATIVE_SHOWN_FLAG, shouldKeepRollFromPlayers } from "../scripts/helpers/initiative-reveal.js";
import CombatantAdapter from "../scripts/services/CombatantAdapter.js";
import CombatProjector from "../scripts/services/CombatProjector.js";
import PhaseProjector from "../scripts/services/PhaseProjector.js";

const foe = { revealed: false, acting: false, disposition: DISPOSITION.HOSTILE, isOwner: false, virtual: false };
const player = { isGM: false, concealEnemyIdentity: true };

describe("enemy identity concealed until its first turn (#14)", () => {
  it("conceals a foe from players until its turn reveals it, and while that turn is up", () => {
    assert.equal(isIdentityHidden(foe, player), true);
    assert.equal(isIdentityHidden({ ...foe, revealed: true }, player), false, "revealed by an earlier turn");
    assert.equal(isIdentityHidden({ ...foe, acting: true }, player), false, "its turn is up now");
  });

  it("never conceals from the GM, owners, friendly combatants or virtual positions, nor with the setting off", () => {
    assert.equal(isIdentityHidden(foe, { ...player, isGM: true }), false);
    assert.equal(isIdentityHidden({ ...foe, isOwner: true }, player), false);
    assert.equal(isIdentityHidden({ ...foe, disposition: DISPOSITION.FRIENDLY }, player), false);
    assert.equal(isIdentityHidden({ ...foe, virtual: true }, player), false);
    assert.equal(isIdentityHidden(foe, { ...player, concealEnemyIdentity: false }), false);
  });

  it("conceals neutral and secret combatants too, as the hidden initiative does", () => {
    assert.equal(isIdentityHidden({ ...foe, disposition: DISPOSITION.NEUTRAL }, player), true);
    assert.equal(isIdentityHidden({ ...foe, disposition: DISPOSITION.SECRET }, player), true);
  });

  it("records the reveal once, on a real turn players can see", () => {
    const turn = { started: true, revealed: false, concealed: false, skipped: false };
    assert.equal(shouldRecordRevealed(turn), true);
    assert.equal(shouldRecordRevealed({ ...turn, revealed: true }), false, "already revealed");
    assert.equal(shouldRecordRevealed({ ...turn, started: false }), false, "before the start");
    assert.equal(shouldRecordRevealed({ ...turn, skipped: true }), false, "a dead turn skipped on the way forward");
    assert.equal(shouldRecordRevealed({ ...turn, concealed: true }), false, "a hidden combatant's turn shows players nothing");
  });

  it("keeps the slot, side and initiative of a placeholder, and nothing that tells who it is", () => {
    const vm = {
      id: "g1", name: "Goblin Boss", initials: "GB", img: "a.webp", tokenImg: "t.webp", artImg: "a.webp",
      initiative: 17, initiativeHidden: false, dispositionKey: "hostile", defeated: false, dead: true, alive: false,
      hp: { mode: "state", stateKey: "down", pct: 0 }, healthTone: "critical",
      players: ["Ana"], cardUserId: "u1", effects: [{ name: "Rage", img: "r.webp", rounds: 2 }],
    };
    const placeholder = unidentifiedViewModel(vm, "Unknown");
    assert.equal(placeholder.identityHidden, true);
    assert.equal(placeholder.id, "g1");
    assert.equal(placeholder.initiative, 17);
    assert.equal(placeholder.dispositionKey, "hostile");
    assert.equal(placeholder.name, "Unknown");
    assert.equal(placeholder.initials, "?");
    assert.equal(placeholder.img, null);
    assert.equal(placeholder.tokenImg, null);
    assert.equal(placeholder.artImg, null);
    assert.deepEqual(placeholder.hp, { mode: "hidden" });
    assert.equal(placeholder.healthTone, null);
    assert.equal(placeholder.dead, true, "decided by the adapter, which reads no hit points for a placeholder");
    assert.deepEqual(placeholder.players, []);
    assert.equal(placeholder.cardUserId, null);
    assert.deepEqual(placeholder.effects, []);
    assert.equal(vm.name, "Goblin Boss", "the input is left untouched");
  });

  it("finds the combatants a model draws, phase members included and phases left out", () => {
    const model = {
      ring: [
        { id: "a", identityHidden: true },
        { id: "phase:fast", kind: "phase", members: [{ id: "c", identityHidden: true }, { id: "d", identityHidden: false }] },
      ],
    };
    const byId = viewModelsById(model);
    assert.deepEqual([...byId.keys()].sort(), ["a", "c", "d"]);
    assert.equal(byId.get("d").identityHidden, false);
    assert.equal(viewModelsById(null).size, 0);
  });

  it("sends a public roll for an unrevealed enemy to the GM only, a revealed one's to everyone", () => {
    const unrevealed = [{ disposition: DISPOSITION.HOSTILE, virtual: false, revealed: false }];
    const revealed = [{ disposition: DISPOSITION.HOSTILE, virtual: false, revealed: true }];
    const options = { hideEnemyInitiative: false, concealEnemyIdentity: true, whisper: [] };
    assert.equal(shouldKeepRollFromPlayers({ ...options, rolled: unrevealed }), true);
    assert.equal(shouldKeepRollFromPlayers({ ...options, rolled: revealed }), false);
    assert.equal(shouldKeepRollFromPlayers({ ...options, rolled: [{ ...unrevealed[0], disposition: DISPOSITION.FRIENDLY }] }), false);
    assert.equal(shouldKeepRollFromPlayers({ ...options, whisper: ["gm"], rolled: unrevealed }), false, "already private");
    assert.equal(shouldKeepRollFromPlayers({ ...options, concealEnemyIdentity: false, rolled: unrevealed }), false);
    assert.equal(shouldKeepRollFromPlayers({ ...options, hideEnemyInitiative: true, rolled: revealed }), true, "the initiative is still hidden");
  });
});

/** A Combatant-shaped object with only what the adapter reads. */
function combatant(id, overrides = {}) {
  const { hp = { value: 10, max: 10 }, disposition = DISPOSITION.HOSTILE, flags = {}, ...rest } = overrides;
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
    flags,
    token: {
      disposition,
      displayName: TOKEN_DISPLAY.ALWAYS,
      texture: { src: `tokens/${id}.webp` },
      getBarAttribute: () => (hp ? { type: "bar", value: hp.value, max: hp.max } : null),
    },
    actor: { img: `actors/${id}.webp`, flags: {}, permission: 1, temporaryEffects: [{ name: "Rage", img: "rage.webp" }] },
    ...rest,
  };
}

const revealedFlags = { [MODULE_ID]: { [IDENTITY_REVEALED_FLAG]: true } };
const settings = {
  portraitSource: "token",
  hpForPlayers: "state",
  npcNames: "always",
  hideEnemyInitiative: false,
  concealEnemyIdentity: true,
  defeatedMode: "fade",
  concealment: "hidden",
  skipDead: "npcs",
  secondsPerRound: 6,
};
const context = (isGM, extra = {}) => ({ isGM, settings: { ...settings, ...extra }, unknownName: "Unknown", round: 1 });

describe("CombatantAdapter with concealed enemies (#14)", () => {
  it("draws an unrevealed foe as a placeholder for players", () => {
    const vm = CombatantAdapter.toViewModel(combatant("g1"), context(false));
    assert.equal(vm.identityHidden, true);
    assert.equal(vm.name, "Unknown");
    assert.equal(vm.img, null);
    assert.equal(vm.artImg, null);
    assert.deepEqual(vm.effects, []);
    assert.equal(vm.initiative, 10, "its initiative follows its own setting (#11)");
  });

  it("shows the GM, owners and friends who they are, and anyone once revealed", () => {
    assert.equal(CombatantAdapter.toViewModel(combatant("g1"), context(true)).name, "Goblin g1");
    assert.equal(CombatantAdapter.toViewModel(combatant("g1", { isOwner: true }), context(false)).identityHidden, false);
    assert.equal(CombatantAdapter.toViewModel(combatant("g1", { disposition: DISPOSITION.FRIENDLY }), context(false)).identityHidden, false);
    const revealed = CombatantAdapter.toViewModel(combatant("g1", { flags: revealedFlags }), context(false));
    assert.equal(revealed.identityHidden, false);
    assert.equal(revealed.name, "Goblin g1");
    assert.equal(revealed.img, "tokens/g1.webp");
  });

  it("shows a foe whose turn is up at once, unless the dead-turn skip passes over it", () => {
    const acting = { ids: new Set(["g1"]), skipDead: "npcs" };
    assert.equal(CombatantAdapter.toViewModel(combatant("g1"), { ...context(false), acting }).identityHidden, false);
    const dead = combatant("g1", { hp: { value: 0, max: 10 } });
    assert.equal(CombatantAdapter.toViewModel(dead, { ...context(false), acting }).identityHidden, true, "skipped at once");
    assert.equal(CombatantAdapter.toViewModel(dead, { ...context(false), acting: { ...acting, skipDead: "never" } }).identityHidden, false);
  });

  it("hides the initiative too when that setting is on, until its own reveal", () => {
    const vm = CombatantAdapter.toViewModel(combatant("g1", { flags: revealedFlags }), context(false, { hideEnemyInitiative: true }));
    assert.equal(vm.identityHidden, false);
    assert.equal(vm.initiativeHidden, true, "the identity is known, the number not yet");
    const shown = { [MODULE_ID]: { [INITIATIVE_SHOWN_FLAG]: 10 } };
    assert.equal(CombatantAdapter.toViewModel(combatant("g1", { flags: shown }), context(false, { hideEnemyInitiative: true })).identityHidden, true);
  });
});

describe("CombatProjector with concealed enemies (#14)", () => {
  const project = (turns, extra) => CombatProjector.project({ id: "c1", round: 1, turn: 0, started: true, turns, ...extra }, context(false));

  it("keeps every slot in Foundry's order, the acting foe named and the others placeholders", () => {
    const model = project([combatant("a"), combatant("b"), combatant("c", { flags: revealedFlags })]);
    assert.deepEqual(model.ring.map((vm) => vm.id), ["a", "b", "c"]);
    assert.deepEqual(model.ring.map((vm) => vm.identityHidden), [false, true, false]);
    assert.equal(model.current.name, "Goblin a");
    assert.equal(model.nextUp.name, "Unknown");
  });

  it("reveals nobody before the start", () => {
    const model = project([combatant("a"), combatant("b")], { round: 0, started: false });
    assert.deepEqual(model.ring.map((vm) => vm.identityHidden), [true, true]);
  });

  it("keeps hidden combatants off a player's ring, even on their turn", () => {
    const model = project([combatant("a", { hidden: true }), combatant("b")]);
    assert.deepEqual(model.ring.map((vm) => vm.id), ["b"]);
    assert.equal(model.activeHidden, true);
    assert.equal(model.ring[0].identityHidden, true);
  });
});

describe("leaving unknown enemies out (#14)", () => {
  const project = (turns, { isGM = false, ...extra } = {}) =>
    CombatProjector.project({ id: "c1", round: 1, turn: 0, started: true, turns, ...extra }, { ...context(isGM, { concealEnemyIdentity: "omit" }) });

  it("reads the stored value as a mode, the first builds' yes as the placeholder", () => {
    assert.equal(concealModeOf("omit"), "omit");
    assert.equal(concealModeOf("placeholder"), "placeholder");
    assert.equal(concealModeOf(true), "placeholder");
    assert.equal(concealModeOf("true"), "placeholder");
    assert.equal(concealModeOf(false), "off");
    assert.equal(concealModeOf(undefined), "off");
  });

  it("keeps only the acting foe and those already revealed on a player's ring", () => {
    const turns = [combatant("a"), combatant("b"), combatant("c", { flags: revealedFlags }), combatant("d", { disposition: DISPOSITION.FRIENDLY })];
    const model = project(turns, { turn: 0 });
    assert.deepEqual(model.ring.map((vm) => vm.id), ["a", "c", "d"]);
    assert.equal(model.current.id, "a");
    assert.equal(model.nextUp.id, "c", "the next one players may know");
    assert.equal(model.N, 3);
  });

  it("adds a foe to the ring when its turn comes", () => {
    const model = project([combatant("a", { flags: revealedFlags }), combatant("b")], { turn: 1 });
    assert.deepEqual(model.ring.map((vm) => vm.id), ["a", "b"]);
    assert.equal(model.current.id, "b");
  });

  it("shows a turn the dead-turn skip only passes through as nobody's", () => {
    const model = project([combatant("a", { flags: revealedFlags }), combatant("b", { hp: { value: 0, max: 10 } })], { turn: 1 });
    assert.deepEqual(model.ring.map((vm) => vm.id), ["a"]);
    assert.equal(model.activeHidden, true);
  });

  it("leaves everyone on the GM's ring", () => {
    assert.equal(project([combatant("a"), combatant("b")], { isGM: true }).N, 2);
  });
});

describe("PhaseProjector with concealed enemies (#14)", () => {
  const V = "sc-venaerys-initiative";
  const phase = (id) => ({ id, type: id, nameKey: `P.${id}`, name: null, icon: `fa-solid fa-${id}`, color: "#5b86c9" });
  const plan = [phase("fast"), phase("enemies"), phase("slow")];
  const member = (id, phaseId, extra = {}) => combatant(id, { ...extra, flags: { [V]: { phase: phaseId } } });

  it("names everyone in the phase that acts, the fallen apart", () => {
    const turns = [member("a", "enemies"), member("b", "enemies", { isDefeated: true }), member("c", "slow")];
    const model = PhaseProjector.project(
      { id: "c1", round: 1, turn: 0, turns, flags: { [V]: { enabled: true, plan } } },
      { ...context(false), localize: (key) => key, waitingName: "Waiting" },
    );
    const members = model.ring.flatMap((entry) => entry.members).map((m) => [m.id, m.identityHidden]);
    assert.deepEqual(members, [["a", false], ["b", true], ["c", true]]);
  });
});
