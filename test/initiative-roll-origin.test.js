import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPOSITION, MODULE_ID, SETTINGS } from "../scripts/constants/module-constants.js";
import { INITIATIVE_SHOWN_FLAG, ROLLED_IN_FLAG, rollOrigin } from "../scripts/helpers/initiative-reveal.js";

/** The `preUpdateCombatant` hook, as the module registers it; set once the module is installed. */
let preUpdateCombatant = () => {};

/** Core's shape: the roll merges `messageOptions` into each message it creates. */
class CoreCombat {
  constructor(id, combatants = []) {
    this.id = id;
    this.combatants = { contents: combatants };
    this.scene = { id: "scene" };
  }

  async rollInitiative(ids, { messageOptions = {} } = {}) {
    // Like core, the messages are created after an awaited update: the viewed combat may change meanwhile.
    await Promise.resolve();
    return { flags: { core: { initiativeRoll: true } }, ...messageOptions };
  }

  /** Core's setInitiative: one update of that combatant, whose pre-update hook may add to the changes. */
  async setInitiative(id, value) {
    const combatant = this.combatants.contents.find((c) => c.id === id);
    const changes = { initiative: value };
    preUpdateCombatant(combatant, changes);
    combatant.lastChanges = changes;
    if (changes.flags) Object.assign(combatant.flags[MODULE_ID], changes.flags[MODULE_ID]);
  }
}

/** A system that overrides the roll and calls super first, as dnd5e's Combat5e does. */
class SuperFirstCombat extends CoreCombat {
  async rollInitiative(ids, options = {}) {
    return super.rollInitiative(ids, options);
  }
}

/** A combatant with only what the reveal reads and writes. */
function combatant(id, tokenId, { shown = null, disposition = DISPOSITION.HOSTILE, initiative = 17 } = {}) {
  const flags = { [MODULE_ID]: { [INITIATIVE_SHOWN_FLAG]: shown } };
  return {
    id,
    initiative,
    tokenId,
    sceneId: "scene",
    actorId: `actor-${id}`,
    flags,
    token: { parent: { id: "scene" }, disposition },
    getFlag: (scope, key) => flags[scope]?.[key],
    setFlag: async (scope, key, value) => {
      flags[scope][key] = value;
    },
  };
}

/** A roll message as the system creates it: public, for the token `goblin`. */
function rollMessage(flags = { core: { initiativeRoll: true } }) {
  return {
    flags,
    speaker: { token: "goblin", scene: "scene", actor: "actor-g" },
    whisper: [],
    mode: "public",
    applyMode(mode) {
      this.mode = mode;
    },
  };
}

describe("where an initiative roll message comes from (#11)", () => {
  it("trusts the combat the message names first", () => {
    assert.deepEqual(rollOrigin({ rolledIn: "A", rolling: ["B"], candidates: ["A", "B"] }), ["A"]);
  });

  it("then a combat rolling right now that holds the token", () => {
    assert.deepEqual(rollOrigin({ rolledIn: null, rolling: ["A"], candidates: ["A", "B"] }), ["A"]);
  });

  it("never guesses, from the combat being viewed or anything else", () => {
    assert.deepEqual(rollOrigin({ rolledIn: null, rolling: [], candidates: ["A", "B"] }), []);
    assert.deepEqual(rollOrigin({ rolledIn: null, rolling: [], candidates: ["A"] }), []);
  });
});

describe("initiative rolls in their own combat (#11)", async () => {
  const hooks = new Map();
  const goblinA = combatant("ga", "goblin", { shown: 17 });
  const goblinB = combatant("gb", "goblin", { shown: 12, initiative: 12 });
  const combatA = new CoreCombat("A", [goblinA]);
  const combatB = new CoreCombat("B", [goblinB]);

  /** PF2e's order: each creature's message is created before core's roll; initiative is set through its own setInitiative. */
  class MessageFirstCombat extends CoreCombat {
    async rollInitiative(ids, options = {}) {
      await Promise.resolve();
      // The GM looks at the other encounter while the roll is under way.
      globalThis.game.combat = combatB;
      this.lastMessage = rollMessage();
      hooks.get("preCreateChatMessage")(this.lastMessage);
      return super.rollInitiative([], options);
    }

    async setInitiative(id, value) {
      return super.setInitiative(id, value);
    }
  }

  globalThis.foundry = { documents: { Combat: CoreCombat } };
  globalThis.CONFIG = { Combat: { documentClass: MessageFirstCombat } };
  globalThis.Hooks = { on: (name, handler) => hooks.set(name, handler), once() {}, callAll() {} };
  globalThis.game = {
    combat: combatA,
    combats: [combatA, combatB],
    settings: { get: (scope, key) => key === SETTINGS.hideEnemyInitiative },
  };
  const { default: InitiativeReveal } = await import("../scripts/services/InitiativeReveal.js");
  InitiativeReveal.install();
  InitiativeReveal.start();
  preUpdateCombatant = hooks.get("preUpdateCombatant");
  const reset = () => {
    goblinA.flags[MODULE_ID][INITIATIVE_SHOWN_FLAG] = 17;
    goblinB.flags[MODULE_ID][INITIATIVE_SHOWN_FLAG] = 12;
  };

  it("marks core's messages with the combat rolling, whatever is viewed by then", async () => {
    globalThis.game.combat = combatB;
    const message = await new CoreCombat("A").rollInitiative(["x"]);
    assert.equal(message.flags[MODULE_ID][ROLLED_IN_FLAG], "A");
  });

  it("covers a system's override that calls super, and keeps the caller's message options", async () => {
    const message = await new SuperFirstCombat("C").rollInitiative(["x"], { messageOptions: { rollMode: "gmroll" } });
    assert.equal(message.flags[MODULE_ID][ROLLED_IN_FLAG], "C");
    assert.equal(message.rollMode, "gmroll");
  });

  it("knows a message a system creates before calling core belongs to the combat rolling (PF2e)", async () => {
    reset();
    globalThis.game.combat = combatA;
    const rolling = Object.assign(new MessageFirstCombat("A", [goblinA]), { combatants: combatA.combatants });
    await rolling.rollInitiative(["ga"]);
    assert.equal(rolling.lastMessage.mode, "gm", "the public roll goes to the GM only");
    assert.equal(goblinA.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), null, "the rolled combat forgets its reveal");
    assert.equal(goblinB.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 12, "the same token in the viewed combat keeps its own");
  });

  it("a roll that does not say its combat hides again only through a new number (PF2e from a sheet, B viewed)", async () => {
    reset();
    globalThis.game.combat = combatB;
    const message = rollMessage();
    hooks.get("preCreateChatMessage")(message);
    assert.equal(message.mode, "gm", "unsure of the combat: shown to the GM only");
    await Object.assign(new MessageFirstCombat("A"), { combatants: combatA.combatants }).setInitiative("ga", 9);
    assert.equal(goblinA.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), null, "a new number hides again, in the combatant set");
    assert.equal(goblinB.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 12, "the viewed combat is never guessed");
    goblinA.initiative = 17;
  });

  it("the same number from such a roll keeps the reveal: players already know it", async () => {
    reset();
    hooks.get("preCreateChatMessage")(rollMessage());
    await combatA.setInitiative("ga", 17);
    assert.equal(goblinA.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 17);
    assert.equal(goblinB.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 12);
  });

  it("never ties a roll to another combatant's set: B's \"Set as Initiative\", then A rolled from a sheet", async () => {
    reset();
    await combatB.setInitiative("gb", 12);
    globalThis.game.combat = combatB;
    hooks.get("preCreateChatMessage")(rollMessage());
    await combatA.setInitiative("ga", 17);
    assert.equal(goblinB.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 12, "B, which did not roll, keeps its reveal");
    assert.equal(goblinA.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 17, "A repeated a number players know");
  });

  it("keeps the reveal when the combatant's form only repeats the number", () => {
    reset();
    const form = { name: "Goblin chief", initiative: 12 };
    preUpdateCombatant(goblinB, form);
    assert.equal(form.flags, undefined);
  });

  it("with no way to tell the combat, forgets nothing and still keeps the roll from players", () => {
    reset();
    globalThis.game.combat = new CoreCombat("C");
    const message = rollMessage();
    hooks.get("preCreateChatMessage")(message);
    assert.equal(message.mode, "gm");
    assert.equal(goblinA.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 17);
    assert.equal(goblinB.getFlag(MODULE_ID, INITIATIVE_SHOWN_FLAG), 12);
  });
});
