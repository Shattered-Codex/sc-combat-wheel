import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: WidgetPosition } = await import("../scripts/services/WidgetPosition.js");

function useSettings(values) {
  const written = {};
  game.settings.get = (module, key) => values[key];
  game.settings.set = async (module, key, value) => {
    written[key] = value;
    values[key] = value;
  };
  return written;
}

describe("wheel position per user (RF-124)", () => {
  it("keeps this browser's old place until the user saves their own, and carries it over", async () => {
    const written = useSettings({ userWidgetState: {}, widgetState: { position: { x: 0.2, y: 0.7 }, locked: true } });
    assert.deepEqual(WidgetPosition.state(), { position: { x: 0.2, y: 0.7 }, locked: true, expanded: false });
    await WidgetPosition.save({ expanded: true });
    assert.deepEqual(written.userWidgetState, { position: { x: 0.2, y: 0.7 }, locked: true, expanded: true });
    assert.equal("widgetState" in written, false, "the browser's value is left alone");
  });

  it("reads the user's own place over the browser's", () => {
    useSettings({ userWidgetState: { position: { x: 0.5, y: 0.1 } }, widgetState: { position: { x: 0.2, y: 0.7 }, locked: true } });
    assert.deepEqual(WidgetPosition.state(), { position: { x: 0.5, y: 0.1 }, locked: false, expanded: false });
  });

  it("reads a save back before the server answers, so a render or a second save keeps the new place", async () => {
    const values = { userWidgetState: { position: { x: 0.5, y: 0.5 } }, widgetState: {} };
    const writes = [];
    game.settings.get = (module, key) => values[key];
    game.settings.set = (module, key, value) => new Promise((resolve) => writes.push(() => { values[key] = value; resolve(); }));
    const dropped = WidgetPosition.save({ position: { x: 0.1, y: 0.9 } });
    assert.deepEqual(WidgetPosition.state().position, { x: 0.1, y: 0.9 });
    const locked = WidgetPosition.save({ locked: true });
    assert.deepEqual(WidgetPosition.state(), { position: { x: 0.1, y: 0.9 }, locked: true, expanded: false });
    for (const write of writes) write();
    await Promise.all([dropped, locked]);
    assert.deepEqual(values.userWidgetState, { position: { x: 0.1, y: 0.9 }, locked: true, expanded: false });
    assert.deepEqual(WidgetPosition.state(), values.userWidgetState);
  });

  it("falls back to the stored state when a save fails", async () => {
    const values = { userWidgetState: { position: { x: 0.5, y: 0.5 } }, widgetState: {} };
    game.settings.get = (module, key) => values[key];
    game.settings.set = async () => { throw new Error("offline"); };
    await assert.rejects(WidgetPosition.save({ position: { x: 0.1, y: 0.9 } }));
    assert.deepEqual(WidgetPosition.state().position, { x: 0.5, y: 0.5 });
  });

  it("forgets only the place on reset", async () => {
    const written = useSettings({ userWidgetState: { position: { x: 0.5, y: 0.1 }, locked: true, expanded: true }, widgetState: {} });
    await WidgetPosition.reset();
    assert.deepEqual(written.userWidgetState, { position: null, locked: true, expanded: true });
  });
});
