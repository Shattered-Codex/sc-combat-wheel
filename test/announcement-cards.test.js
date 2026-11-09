import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: AnnouncementCards } = await import("../scripts/services/AnnouncementCards.js");

const viewer = { announceEffect: "none", announceParticles: "none", announceStyle: "card", announcePlayerCards: true };
const card = { announceEffect: "inferno", announceParticles: "embers", announceStyle: "cinematic" };

function table({ mode, locked = [], tableLook = {} }) {
  const values = { tableLookMode: mode, lockedLook: locked, tableLook };
  game.settings.get = (module, key) => values[key];
  game.users = { get: (id) => (id === "u1" ? { isGM: false, getFlag: () => card } : null) };
}

describe("a player's card as the viewer draws it (RF-123)", () => {
  it("is drawn whole when every player picks their own look", () => {
    table({ mode: "off" });
    const drawn = AnnouncementCards.lookWith("u1", viewer);
    assert.deepEqual([drawn.announceEffect, drawn.announceParticles, drawn.announceStyle], ["inferno", "embers", "cinematic"]);
  });

  it("never overrides an option the GM locked for the table, even from a card stored before the lock", () => {
    table({ mode: "partial", locked: ["announceEffect"], tableLook: { announceEffect: "none" } });
    const drawn = AnnouncementCards.lookWith("u1", viewer);
    assert.equal(drawn.announceEffect, "none");
    assert.deepEqual([drawn.announceParticles, drawn.announceStyle], ["embers", "cinematic"], "the rest is the player's");
  });

  it("is not drawn while the GM makes everyone use the table look", () => {
    table({ mode: "forced" });
    assert.equal(AnnouncementCards.lookWith("u1", viewer), viewer);
  });
});
