import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPOSITION, MODULE_ID } from "../scripts/constants/module-constants.js";
import {
  INITIATIVE_SHOWN_FLAG,
  combatantsOfSpeaker,
  forgetShownInitiative,
  forgetShownOnReset,
  initiativeLabel,
  isInitiativeHidden,
  isInitiativeRollMessage,
  rolledInOf,
  shouldKeepRollFromPlayers,
  shouldRecordShown,
  withRolledIn,
} from "../scripts/helpers/initiative-reveal.js";
import CombatantAdapter from "../scripts/services/CombatantAdapter.js";

const foe = { initiative: 17, shown: undefined, disposition: DISPOSITION.HOSTILE, isOwner: false, virtual: false };
const player = { isGM: false, hideEnemyInitiative: true };

describe("enemy initiative hidden until its turn (#11)", () => {
  it("hides a foe's number from players until its turn showed it", () => {
    assert.equal(isInitiativeHidden(foe, player), true);
    assert.equal(isInitiativeHidden({ ...foe, shown: 17 }, player), false, "shown on its turn");
  });

  it("never hides from the GM, owners, friendly combatants or virtual positions, nor with the setting off", () => {
    assert.equal(isInitiativeHidden(foe, { ...player, isGM: true }), false);
    assert.equal(isInitiativeHidden({ ...foe, isOwner: true }, player), false);
    assert.equal(isInitiativeHidden({ ...foe, disposition: DISPOSITION.FRIENDLY }, player), false);
    assert.equal(isInitiativeHidden({ ...foe, virtual: true }, player), false);
    assert.equal(isInitiativeHidden(foe, { ...player, hideEnemyInitiative: false }), false);
  });

  it("hides neutral and secret combatants too: only friends are spared, as with exact hit points", () => {
    assert.equal(isInitiativeHidden({ ...foe, disposition: DISPOSITION.NEUTRAL }, player), true);
    assert.equal(isInitiativeHidden({ ...foe, disposition: DISPOSITION.SECRET }, player), true);
  });

  it("hides a rerolled number again until that combatant's next turn", () => {
    assert.equal(isInitiativeHidden({ ...foe, initiative: 9, shown: 17 }, player), true);
  });

  it("has nothing to hide before a roll", () => {
    assert.equal(isInitiativeHidden({ ...foe, initiative: null }, player), false);
  });

  it("records the number when the turn comes up, once per value", () => {
    assert.equal(shouldRecordShown({ started: true, initiative: 17, shown: undefined, skipped: false }), true);
    assert.equal(shouldRecordShown({ started: true, initiative: 17, shown: 17, skipped: false }), false, "already recorded");
    assert.equal(shouldRecordShown({ started: true, initiative: 9, shown: 17, skipped: false }), true, "a reroll");
  });

  it("records nothing before the start, without a roll, or on a turn skipped on the way forward", () => {
    assert.equal(shouldRecordShown({ started: false, initiative: 17, shown: undefined, skipped: false }), false);
    assert.equal(shouldRecordShown({ started: true, initiative: null, shown: undefined, skipped: false }), false);
    assert.equal(shouldRecordShown({ started: true, initiative: 17, shown: undefined, skipped: true }), false);
  });

  it("forgets the shown number when the update gives another one, or clears it", () => {
    const changed = { initiative: 9 };
    assert.equal(forgetShownInitiative(changed, 17, 17), true);
    assert.equal(changed.flags[MODULE_ID][INITIATIVE_SHOWN_FLAG], null);
    const cleared = { initiative: null };
    assert.equal(forgetShownInitiative(cleared, 17, 17), true, "a reset of one combatant");
    assert.equal(cleared.flags[MODULE_ID][INITIATIVE_SHOWN_FLAG], null);
    assert.equal(isInitiativeHidden({ ...foe, initiative: 9, shown: null }, player), true);
  });

  it("keeps it when the combatant's form only repeats the same initiative", () => {
    const form = { name: "Goblin chief", img: "chief.webp", initiative: 17 };
    assert.equal(forgetShownInitiative(form, 17, 17), false);
    assert.equal(form.flags, undefined);
    assert.equal(forgetShownInitiative({ initiative: "17" }, 17, 17), false, "the form may send text");
  });

  it("leaves other updates and never-shown combatants alone", () => {
    const moved = { flags: { other: 1 } };
    assert.equal(forgetShownInitiative(moved, 17, 17), false);
    assert.deepEqual(moved, { flags: { other: 1 } });
    const firstRoll = { initiative: 12 };
    assert.equal(forgetShownInitiative(firstRoll, undefined, null), false);
    assert.deepEqual(firstRoll, { initiative: 12 });
  });

  it("finds the combatants a roll message speaks for", () => {
    const combatants = [
      { id: "a", tokenId: "t1", sceneId: "s1", actorId: "x" },
      { id: "b", tokenId: "t2", sceneId: "s1", actorId: "x" },
      { id: "c", tokenId: null, sceneId: null, actorId: "y" },
    ];
    assert.deepEqual(combatantsOfSpeaker({ token: "t1", scene: "s1", actor: "x" }, combatants).map((c) => c.id), ["a"]);
    assert.deepEqual(combatantsOfSpeaker({ token: null, actor: "y" }, combatants).map((c) => c.id), ["c"]);
    assert.deepEqual(combatantsOfSpeaker(null, combatants), []);
    assert.deepEqual(combatantsOfSpeaker({ token: "t1", scene: "s2" }, combatants), [], "the same token id on another scene");
    assert.deepEqual(
      combatantsOfSpeaker({ token: "t9", scene: "s1" }, [{ id: "d", tokenId: "t9", sceneId: null, actorId: "z" }]).map((c) => c.id),
      ["d"],
      "a combatant whose scene is unknown matches by its token",
    );
    assert.equal(isInitiativeRollMessage({ core: { initiativeRoll: true } }), true);
    assert.equal(isInitiativeRollMessage({ "core.initiativeRoll": true }), true);
    assert.equal(isInitiativeRollMessage({}), false);
  });

  it("names the combat a roll belongs to in its messages, keeping the caller's options", () => {
    const options = withRolledIn({ rollMode: "gmroll", flags: { "core.extra": 1, [MODULE_ID]: { other: true } } }, "combatA");
    assert.equal(options.rollMode, "gmroll");
    assert.equal(options.flags["core.extra"], 1);
    assert.equal(options.flags[MODULE_ID].other, true);
    assert.equal(rolledInOf(options.flags), "combatA");
    assert.equal(rolledInOf(withRolledIn(undefined, "combatB").flags), "combatB");
    assert.equal(rolledInOf({}), null, "a message that does not say");
  });

  it("sends a public roll for an enemy to the GM only, while the option is on", () => {
    const enemy = [{ disposition: DISPOSITION.HOSTILE, virtual: false }];
    assert.equal(shouldKeepRollFromPlayers({ hideEnemyInitiative: true, whisper: [], rolled: enemy }), true);
    assert.equal(shouldKeepRollFromPlayers({ hideEnemyInitiative: false, whisper: [], rolled: enemy }), false);
    assert.equal(shouldKeepRollFromPlayers({ hideEnemyInitiative: true, whisper: ["gm"], rolled: enemy }), false, "already private");
    assert.equal(shouldKeepRollFromPlayers({ hideEnemyInitiative: true, whisper: [], rolled: [{ disposition: DISPOSITION.FRIENDLY, virtual: false }] }), false);
    assert.equal(shouldKeepRollFromPlayers({ hideEnemyInitiative: true, whisper: [], rolled: [] }), false, "no combatant found");
  });

  it("forgets every shown number Combat#resetAll() clears", () => {
    const changes = {
      combatants: [
        { _id: "a", initiative: null, flags: { [MODULE_ID]: { [INITIATIVE_SHOWN_FLAG]: 17 } } },
        { _id: "b", initiative: null, flags: {} },
        { _id: "v", initiative: 20, flags: { [MODULE_ID]: { [INITIATIVE_SHOWN_FLAG]: 20 } } },
      ],
    };
    assert.equal(forgetShownOnReset(changes), 1);
    assert.equal(changes.combatants[0].flags[MODULE_ID][INITIATIVE_SHOWN_FLAG], null);
    assert.equal(changes.combatants[2].flags[MODULE_ID][INITIATIVE_SHOWN_FLAG], 20, "a kept initiative keeps its reveal");
    assert.equal(forgetShownOnReset({ round: 2 }), 0);
  });

  it("prints a question mark while hidden", () => {
    assert.equal(initiativeLabel({ initiative: null, initiativeHidden: true }), "?");
    assert.equal(initiativeLabel({ initiative: 12 }), 12);
    assert.equal(initiativeLabel({ initiative: null }), "—");
    assert.equal(initiativeLabel({ initiative: null }, null), null);
  });
});

describe("CombatantAdapter with hidden enemy initiative (#11)", () => {
  const settings = { portraitSource: "token", hpForPlayers: "state", npcNames: "always", hideEnemyInitiative: true };
  const context = (isGM) => ({ isGM, settings, unknownName: "Unknown", round: 1 });
  const goblin = (flags = {}) => ({
    id: "g",
    name: "Goblin",
    initiative: 17,
    isOwner: false,
    players: [],
    flags,
    token: { disposition: DISPOSITION.HOSTILE, texture: { src: "g.webp" }, getBarAttribute: () => null },
    actor: { img: "g.webp", flags: {}, temporaryEffects: [] },
  });

  it("gives players no number, only the mark, while the roll still counts as made", () => {
    const vm = CombatantAdapter.toViewModel(goblin(), context(false));
    assert.equal(vm.initiative, null);
    assert.equal(vm.initiativeHidden, true);
    assert.equal(vm.hasInitiative, true, "not shown as waiting for a roll");
  });

  it("gives the GM the number, and players too once its turn showed it", () => {
    assert.equal(CombatantAdapter.toViewModel(goblin(), context(true)).initiative, 17);
    const shown = goblin({ [MODULE_ID]: { [INITIATIVE_SHOWN_FLAG]: 17 } });
    assert.equal(CombatantAdapter.toViewModel(shown, context(false)).initiative, 17);
  });
});
