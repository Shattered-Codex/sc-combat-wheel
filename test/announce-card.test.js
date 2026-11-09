import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CARD_KEYS, cardOf, withCard } from "../scripts/helpers/announce-card.js";

const look = {
  announceShareCard: true,
  announceMode: "auto",
  announcePosition: "top",
  announceSeconds: 3,
  announceTitle: "My turn!",
  announceImage: "token",
  announceFrame: "square",
  announceBorder: "glow",
  announceStyle: "cinematic",
  announceEntrance: "slide",
  announceColor: "custom",
  announceCustomColor: "#ff0000",
  announceEffect: "storm",
  announceParticles: "sparks",
  announceIntensity: "strong",
};

describe("players' announcement cards (RF-123)", () => {
  it("shares only how the card looks, and nothing when the player keeps it to themselves", () => {
    const card = cardOf(look);
    assert.deepEqual(Object.keys(card).sort(), [...CARD_KEYS].sort());
    for (const key of ["announceMode", "announcePosition", "announceSeconds", "announceTitle", "announceShareCard"]) assert.equal(key in card, false, key);
    assert.equal(cardOf({ ...look, announceShareCard: false }), null);
  });

  it("draws a player's card over the viewer's look, keeping where, how long and the title", () => {
    const viewer = { ...look, announceShareCard: false, announcePosition: "bottom", announceSeconds: 5, announceTitle: "", announceStyle: "corner", announceEffect: "none" };
    const drawn = withCard(viewer, cardOf(look));
    assert.deepEqual([drawn.announceStyle, drawn.announceEffect, drawn.announceCustomColor], ["cinematic", "storm", "#ff0000"]);
    assert.deepEqual([drawn.announcePosition, drawn.announceSeconds, drawn.announceTitle], ["bottom", 5, ""]);
  });

  it("checks every value a player wrote, ignoring the invalid and the unknown", () => {
    const viewer = { ...look, announceShareCard: false, announceEffect: "halo", announceCustomColor: "#00ff00" };
    const forged = { announceEffect: "<script>", announceCustomColor: "red; background: url(x)", announcePosition: "top", announceStyle: "card" };
    const drawn = withCard(viewer, forged);
    assert.deepEqual([drawn.announceEffect, drawn.announceCustomColor, drawn.announceStyle], ["halo", "#00ff00", "card"]);
    assert.equal(drawn.announcePosition, viewer.announcePosition);
    const objects = { announceCustomColor: { toString: null }, announceEffect: { valueOf: null, toString: null }, announceIntensity: ["strong"], announceStyle: null };
    assert.doesNotThrow(() => withCard(viewer, objects));
    const kept = withCard(viewer, objects);
    assert.deepEqual([kept.announceCustomColor, kept.announceEffect, kept.announceIntensity, kept.announceStyle], [viewer.announceCustomColor, viewer.announceEffect, viewer.announceIntensity, viewer.announceStyle]);
    assert.equal(withCard(viewer, Object.create({ announceEffect: "storm" })).announceEffect, "halo", "only the card's own keys");
    assert.equal(withCard(viewer, ["storm"]), viewer);
    assert.equal(withCard(viewer, null), viewer);
    assert.equal(withCard(viewer, "nonsense"), viewer);
  });
});
