import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: SoundPlayer } = await import("../scripts/services/SoundPlayer.js");

describe("SoundPlayer", () => {
  const played = [];
  foundry.audio = { AudioHelper: { play: async (data) => played.push(data) } };

  const withInterfaceVolume = (value, muted = false) => {
    game.settings.get = (scope, key) => (scope === "core" && key === "globalInterfaceVolume" ? value : undefined);
    game.audio = { globalMute: muted };
  };

  it("hands a file only the wheel's volume: the interface channel applies its own", async () => {
    withInterfaceVolume(0.5);
    played.length = 0;
    assert.equal(await new SoundPlayer().play("file", "sounds/gong.ogg", 1), true);
    assert.equal(played[0].volume, 1);
    assert.equal(played[0].channel, "interface");
  });

  it("plays nothing when Foundry is muted or its interface volume is off", async () => {
    played.length = 0;
    withInterfaceVolume(0.5, true);
    assert.equal(await new SoundPlayer().play("file", "sounds/gong.ogg", 1), false);
    withInterfaceVolume(0);
    assert.equal(await new SoundPlayer().play("file", "sounds/gong.ogg", 1), false);
    assert.equal(played.length, 0);
  });
});
