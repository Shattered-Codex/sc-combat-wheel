import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";
import { SETTINGS } from "../scripts/constants/module-constants.js";
import { normalizeTemplate } from "../scripts/helpers/virtual-positions.js";

installFoundryStubs();

const ran = [];
const warnings = [];
CONFIG.Macro = {
  documentClass: class {
    constructor(data) {
      this.data = data;
    }
    async execute(scope) {
      ran.push({ command: this.data.command, scope });
    }
  },
};
game.user.isGM = true;
game.users.activeGM = { isSelf: true };
ui.notifications = { warn: (text) => warnings.push(text) };

const saved = normalizeTemplate({
  id: "lair",
  name: "Lair action",
  consequences: [{ id: "r1", kind: "macro", params: { source: "inline", script: "return 'from the setting';" } }],
});
game.settings.get = (scope, key) => (key === SETTINGS.virtualTemplates ? [saved] : undefined);

const { default: ConsequenceRunner } = await import("../scripts/services/ConsequenceRunner.js");
const originalError = console.error;

/** Runs `config` as the active GM would, keeping the expected error log out of the output. */
async function run(config) {
  console.error = () => {};
  try {
    await ConsequenceRunner.run(config, { combat: {}, combatant: {} }, { visible: true });
  } finally {
    console.error = originalError;
  }
}

describe("inline macro consequences run only from a saved template", () => {
  it("runs the script the world setting holds", async () => {
    ran.length = 0;
    await run(saved);
    assert.deepEqual(ran.map((entry) => entry.command), ["return 'from the setting';"]);
    assert.ok("virtual" in ran[0].scope && "combat" in ran[0].scope && "combatant" in ran[0].scope);
  });

  it("runs the setting's script, never a different one copied into a combatant's flags", async () => {
    ran.length = 0;
    const tampered = { ...saved, consequences: [{ ...saved.consequences[0], params: { ...saved.consequences[0].params, script: "steal()" } }] };
    await run(tampered);
    assert.deepEqual(ran.map((entry) => entry.command), ["return 'from the setting';"]);
  });

  it("refuses a script no saved template holds, and tells the GM", async () => {
    ran.length = 0;
    warnings.length = 0;
    const forged = normalizeTemplate({
      id: "forged",
      name: "Forged",
      consequences: [{ id: "x", kind: "macro", params: { source: "inline", script: "steal()" } }],
    });
    await run(forged);
    assert.deepEqual(ran, []);
    assert.equal(warnings.length, 1);
  });
});
