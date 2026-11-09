import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { SETTINGS_SCHEMA, settingDefault } = await import("../scripts/constants/settings-schema.js");
const { appearanceValues, lockedKeys, portraitSource } = await import("../scripts/hooks/register-settings.js");

const APPEARANCE = SETTINGS_SCHEMA.filter((entry) => entry.section === "appearance");

/** A store with every look default, the player's own changes, and the table's settings. */
function useStore(values) {
  const store = new Map(APPEARANCE.map((entry) => [entry.key, settingDefault(entry)]));
  for (const [key, value] of Object.entries(values)) store.set(key, value);
  game.settings.get = (module, key) => store.get(key);
}

describe("locking some options for the table (RF-119)", () => {
  afterEach(() => {
    game.user.isGM = true;
  });

  const table = { tableLookMode: "partial", tableLook: { theme: "gothic", scale: 120, view: "carousel" }, lockedLook: ["theme", "scale", "notASetting"] };

  it("gives a player the GM's values for the locked options and their own for the rest", () => {
    game.user.isGM = false;
    useStore({ ...table, theme: "paper", scale: 90, view: "slider" });
    const look = appearanceValues();
    assert.equal(look.theme, "gothic");
    assert.equal(look.scale, 120);
    assert.equal(look.view, "slider", "an open option stays the player's");
    assert.deepEqual([...lockedKeys()].sort(), ["scale", "theme"], "only real look options");
  });

  it("locks nothing for the GM, or under any other mode", () => {
    useStore({ ...table, theme: "paper" });
    assert.equal(lockedKeys().size, 0);
    assert.equal(appearanceValues().theme, "paper");
    game.user.isGM = false;
    useStore({ ...table, tableLookMode: "off", theme: "paper" });
    assert.equal(lockedKeys().size, 0);
    assert.equal(appearanceValues().theme, "paper");
  });

  it("keeps the player's value when the table look lacks a locked option", () => {
    game.user.isGM = false;
    useStore({ ...table, tableLook: {}, theme: "paper" });
    assert.equal(appearanceValues().theme, "paper");
  });

  it("locks the portrait image too (RF-117)", () => {
    game.user.isGM = false;
    useStore({ ...table, lockedLook: ["portraitImage"], tableLook: { portraitImage: "actor" }, portraitImage: "token", portraitSource: "token" });
    assert.equal(portraitSource(), "actor");
    useStore({ ...table, lockedLook: [], tableLook: { portraitImage: "actor" }, portraitImage: "token", portraitSource: "token" });
    assert.equal(portraitSource(), "token");
  });
});
