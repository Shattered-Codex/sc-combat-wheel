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

  it("forgets only the place on reset", async () => {
    const written = useSettings({ userWidgetState: { position: { x: 0.5, y: 0.1 }, locked: true, expanded: true }, widgetState: {} });
    await WidgetPosition.reset();
    assert.deepEqual(written.userWidgetState, { position: null, locked: true, expanded: true });
  });
});
