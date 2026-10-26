import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { portraitSource } = await import("../scripts/hooks/register-settings.js");

function useSettings(values) {
  game.settings.get = (module, key) => values[key];
}

describe("portrait image (RF-117)", () => {
  it("takes the user's own pick over the world's", () => {
    useSettings({ portraitImage: "actor", portraitSource: "token" });
    assert.equal(portraitSource(), "actor");
  });

  it("keeps the world's source with 'as the table', the custom flag included", () => {
    useSettings({ portraitImage: "table", portraitSource: "flag" });
    assert.equal(portraitSource(), "flag");
  });

  it("lets the editor's draft speak for an unsaved look", () => {
    useSettings({ portraitImage: "table", portraitSource: "token" });
    assert.equal(portraitSource("actor"), "actor");
    assert.equal(portraitSource("table"), "token");
  });

  it("follows the table look's pick for a player who uses it", () => {
    game.user.isGM = false;
    try {
      useSettings({ portraitImage: "token", portraitSource: "token", tableLookMode: "forced", tableLook: { portraitImage: "actor" } });
      assert.equal(portraitSource(), "actor");
      useSettings({ portraitImage: "token", portraitSource: "token", tableLookMode: "forced", tableLook: {} });
      assert.equal(portraitSource(), "token", "a table look saved before the option keeps the player's own");
    } finally {
      game.user.isGM = true;
    }
  });
});
