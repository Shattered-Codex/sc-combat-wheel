import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { installFoundryStubs, moduleRecord, registered } from "./helpers/foundry-stub.js";

/**
 * Loads the whole ES graph against a stubbed Foundry. A broken import or a
 * class extending something that does not exist takes the module down at load,
 * long before any wheel is drawn.
 */
describe("module entry point", () => {
  before(async () => {
    installFoundryStubs();
    await import("../scripts/module.js");
  });

  it("wires init, ready and the scene control button", () => {
    assert.ok(registered.once.has("init"));
    assert.ok(registered.once.has("ready"));
    assert.ok(registered.on.has("getSceneControlButtons"));
  });

  it("registers settings and keybindings on init without throwing", () => {
    registered.once.get("init")();
  });

  it("exposes the API on ready", () => {
    registered.once.get("ready")();
    assert.equal(typeof moduleRecord.api.toggle, "function");
    assert.equal(typeof moduleRecord.api.open, "function");
  });

  it("adds a toggle button to the token tools", () => {
    const controls = { tokens: { tools: { select: {} } } };
    for (const hook of registered.on.get("getSceneControlButtons")) hook(controls);
    const tool = controls.tokens.tools["sc-combat-wheel"];
    assert.equal(tool.button, true);
    assert.equal(typeof tool.onChange, "function");
  });

  it("watches combat updates to open the wheel when combat starts", () => {
    assert.ok(registered.on.has("updateCombat"));
    assert.ok(registered.on.has("deleteCombat"));
  });
});
