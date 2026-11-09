import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { SETTINGS_SCHEMA, settingDefault } = await import("../scripts/constants/settings-schema.js");
const { currentStyleId, saveLook, savedStyles } = await import("../scripts/hooks/register-settings.js");

const APPEARANCE = SETTINGS_SCHEMA.filter((entry) => entry.section === "appearance");

/** A settings store holding every look default, and the writes made to it. */
function useStore(extra = {}) {
  const store = new Map(APPEARANCE.map((entry) => [entry.key, settingDefault(entry)]));
  for (const [key, value] of Object.entries(extra)) store.set(key, value);
  const writes = [];
  game.settings.get = (module, key) => store.get(key);
  game.settings.set = async (module, key, value) => {
    writes.push(key);
    store.set(key, value);
  };
  return { store, writes };
}

describe("saved styles and the quick change (RF-108, RF-110)", () => {
  beforeEach(() => {
    game.user.isGM = true;
  });

  it("reads a style's merged theme as the theme it became", () => {
    useStore({ savedStyles: [{ id: "deep", name: "Underwater", values: { theme: "ink" } }] });
    assert.equal(savedStyles()[0].values.theme, "gothic");
  });

  it("makes a style the GM's look and the table look, writing only what changed", async () => {
    const { store, writes } = useStore({ savedStyles: [{ id: "deep", name: "Underwater", values: { theme: "gothic", scale: 120 } }] });
    await saveLook(savedStyles()[0].values);
    assert.deepEqual(writes.sort(), ["scale", "tableLook", "theme"]);
    assert.equal(store.get("theme"), "gothic");
    assert.equal(store.get("tableLook").scale, 120);
  });

  it("leaves the table look alone for a player", async () => {
    game.user.isGM = false;
    try {
      const { writes } = useStore();
      await saveLook({ scale: 120 });
      assert.deepEqual(writes, ["scale"]);
    } finally {
      game.user.isGM = true;
    }
  });

  it("knows which style the saved look is, once it was applied", async () => {
    useStore({ savedStyles: [{ id: "deep", name: "Underwater", values: { scale: 120 } }, { id: "calm", name: "Calm", values: {} }] });
    assert.equal(currentStyleId(), "calm", "the defaults are the empty style");
    await saveLook({ scale: 120 });
    assert.equal(currentStyleId(), "deep");
    await saveLook({ scale: 90 });
    assert.equal(currentStyleId(), null);
  });
});
