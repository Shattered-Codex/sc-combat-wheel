import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: VirtualPositions } = await import("../scripts/services/VirtualPositions.js");

function setup() {
  game.user.isGM = true;
  const lair = { id: "lair", name: "Lair", img: "icons/lair.webp", initiative: 20, consequences: [] };
  game.settings.get = (module, key) => (key === "virtualTemplates" ? [lair] : undefined);
  const created = [];
  const combat = { createEmbeddedDocuments: async (type, data) => (created.push(...data), data) };
  return { combat, created };
}

describe("a virtual position added from the overview (RF-69)", () => {
  it("takes the picture picked in the form, over its template's", async () => {
    const { combat, created } = setup();
    await VirtualPositions.addAt(combat, { initiative: 12.5, name: "", text: "", img: "icons/quake.webp", templateId: "lair" });
    assert.deepEqual([created[0].img, created[0].name, created[0].initiative], ["icons/quake.webp", "Lair", 12.5]);
    assert.equal(created[0].flags["sc-combat-wheel"].virtual.templateId, "lair", "still follows its template otherwise");
  });

  it("keeps the template's picture, or the default, when none is picked", async () => {
    const { combat, created } = setup();
    await VirtualPositions.addAt(combat, { initiative: 5, name: "", text: "", img: "", templateId: "lair" });
    await VirtualPositions.addAt(combat, { initiative: 4, name: "Quake", text: "The ground shakes", img: "", templateId: "" });
    assert.equal(created[0].img, "icons/lair.webp");
    assert.equal(created[1].img, "icons/svg/lightning.svg");
  });

  it("gives a one-off message its own picture", async () => {
    const { combat, created } = setup();
    await VirtualPositions.addAt(combat, { initiative: 4, name: "Quake", text: "The ground shakes", img: "icons/quake.webp", templateId: "" });
    assert.equal(created[0].img, "icons/quake.webp");
    assert.equal(created[0].flags["sc-combat-wheel"].virtual.consequences[0].kind, "screenMessage");
  });
});
