import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPOSITION } from "../scripts/constants/module-constants.js";
import {
  healthState,
  hpView,
  initialsOf,
  isConcealed,
  isDeadForViewer,
  isOnRing,
  shouldSkipTurn,
} from "../scripts/helpers/visibility-rules.js";

describe("isOnRing", () => {
  it("keeps concealed combatants for the GM only", () => {
    assert.equal(isOnRing({ concealed: true }, { isGM: true, defeatedMode: "fade" }), true);
    assert.equal(isOnRing({ concealed: true }, { isGM: false, defeatedMode: "fade" }), false);
  });

  it("removes dead combatants for everyone in remove mode", () => {
    assert.equal(isOnRing({ dead: true }, { isGM: true, defeatedMode: "remove" }), false);
    assert.equal(isOnRing({ dead: true }, { isGM: false, defeatedMode: "fade" }), true);
  });
});

describe("isConcealed (RF-45)", () => {
  it("always conceals combatants hidden in the tracker", () => {
    assert.equal(isConcealed({ hidden: true }, "hidden"), true);
  });

  it("follows the world setting for hidden tokens and invisibility", () => {
    const hiddenToken = { tokenHidden: true };
    const invisible = { invisible: true };
    assert.equal(isConcealed(hiddenToken, "hidden"), false);
    assert.equal(isConcealed(hiddenToken, "tokenHidden"), true);
    assert.equal(isConcealed(invisible, "tokenHidden"), false);
    assert.equal(isConcealed(invisible, "invisible"), true);
    assert.equal(isConcealed(hiddenToken, "invisible"), true);
  });
});

describe("isDeadForViewer (RF-41)", () => {
  it("counts defeated and down combatants", () => {
    assert.equal(isDeadForViewer({ defeated: true }, { mode: "hidden" }), true);
    assert.equal(isDeadForViewer({}, { mode: "state", stateKey: "down" }), true);
    assert.equal(isDeadForViewer({}, { mode: "bar", pct: 0, stateKey: null }), true);
  });

  it("never gives away secret hit points", () => {
    assert.equal(isDeadForViewer({}, { mode: "hidden" }), false);
    assert.equal(isDeadForViewer({}, { mode: "none" }), false);
  });
});

describe("shouldSkipTurn (RF-46)", () => {
  const deadNpc = { hpTotal: { value: 0, max: 7 }, hasPlayerOwner: false };
  const deadPc = { hpTotal: { value: 0, max: 30 }, hasPlayerOwner: true };

  it("skips nothing by default", () => {
    assert.equal(shouldSkipTurn(deadNpc, "never"), false);
  });

  it("skips dead NPCs only, leaving players their turn", () => {
    assert.equal(shouldSkipTurn(deadNpc, "npcs"), true);
    assert.equal(shouldSkipTurn(deadPc, "npcs"), false);
    assert.equal(shouldSkipTurn({ defeated: true, hasPlayerOwner: false }, "npcs"), true);
  });

  it("skips every dead combatant in all mode, never the living or virtual", () => {
    assert.equal(shouldSkipTurn(deadPc, "all"), true);
    assert.equal(shouldSkipTurn({ hpTotal: { value: 3, max: 7 } }, "all"), false);
    assert.equal(shouldSkipTurn({ virtual: true, defeated: true }, "all"), false);
  });
});

describe("healthState", () => {
  it("uses the SPEC §5.2 bands", () => {
    assert.equal(healthState(10, 10), "unhurt");
    assert.equal(healthState(6, 10), "wounded");
    assert.equal(healthState(5, 10), "bloodied");
    assert.equal(healthState(2, 10), "critical");
    assert.equal(healthState(0, 10), "down");
  });
});

describe("hpView", () => {
  const foe = { isGM: false, isOwner: false, disposition: DISPOSITION.HOSTILE };

  it("honours every player mode for non-friendly combatants", () => {
    const hp = { value: 3, max: 10 };
    assert.equal(hpView(hp, { ...foe, hpForPlayers: "number" }).text, "3/10");
    assert.equal(hpView(hp, { ...foe, hpForPlayers: "bar" }).pct, 0.3);
    assert.equal(hpView(hp, { ...foe, hpForPlayers: "state" }).pct, 0.5, "band fill, not the exact ratio");
    assert.equal(hpView(hp, { ...foe, hpForPlayers: "hidden" }).mode, "hidden");
  });

  it("returns none when the token has no usable bar", () => {
    assert.equal(hpView(null, { ...foe, hpForPlayers: "number" }).mode, "none");
    assert.equal(hpView({ value: 3, max: 0 }, { ...foe, hpForPlayers: "number" }).mode, "none");
  });
});

describe("initialsOf", () => {
  it("keeps two initials or one plus a trailing number", () => {
    assert.equal(initialsOf("Aria Ventolume"), "AV");
    assert.equal(initialsOf("Goblin Batedor 2"), "G2");
    assert.equal(initialsOf(""), "?");
  });
});
