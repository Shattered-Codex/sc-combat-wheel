import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installFoundryStubs } from "./helpers/foundry-stub.js";

installFoundryStubs();
const { default: WheelViewData } = await import("../scripts/applications/WheelViewData.js");

const vm = (id, extra = {}) => ({
  id,
  name: id,
  hp: { mode: "number", text: "5/10", pct: 0.5, critical: false, stateKey: "bloodied" },
  hasInitiative: true,
  hasPlayerOwner: false,
  players: [],
  effects: [],
  dispositionKey: "hostile",
  ...extra,
});
const model = (extra = {}) => ({
  N: 3,
  T: 0,
  round: 1,
  started: true,
  ring: [vm("a"), vm("b"), vm("c")],
  current: vm("a"),
  currentIndex: 0,
  activeHidden: false,
  needsRoll: false,
  pendingOwnIds: [],
  rolledCount: 3,
  turnLabel: "1/3",
  ...extra,
});
const ui = (extra = {}) => ({ orientation: "up", locked: false, details: true, expanded: false, menu: null, rolling: false, viewIndex: null, ...extra });

describe("WheelViewData.hub", () => {
  it("shows who is acting", () => {
    const hub = WheelViewData.hub(model(), ui());
    assert.equal(hub.turn, true);
    assert.equal(hub.name, "a");
    assert.equal(hub.peeking, undefined);
  });

  it("shows the viewed combatant and a way back while viewing (RF-21, RF-22)", () => {
    const hub = WheelViewData.hub(model(), ui({ viewIndex: 2 }));
    assert.equal(hub.peeking, true);
    assert.equal(hub.name, "c");
    assert.match(hub.label, /Hub\.Viewing/);
  });

  it("asks for initiative while rolls are pending", () => {
    const hub = WheelViewData.hub(model({ needsRoll: true, pendingOwnIds: ["b"], rolledCount: 2 }), ui());
    assert.equal(hub.roll, true);
    assert.equal(hub.canRoll, true);
  });

  it("waits without naming a hidden actor", () => {
    const hub = WheelViewData.hub(model({ activeHidden: true }), ui());
    assert.equal(hub.waiting, true);
    assert.equal(hub.name, undefined);
  });
});

describe("WheelViewData.bar", () => {
  it("offers the way back only while viewing", () => {
    assert.equal(WheelViewData.bar(model(), ui()).peeking, false);
    assert.equal(WheelViewData.bar(model(), ui({ viewIndex: 1 })).peeking, true);
  });

  it("disables the grid for an empty combat", () => {
    assert.equal(WheelViewData.bar(model({ N: 0, ring: [] }), ui()).canOpenGrid, false);
  });

  it("points the expand chevron away from the arc", () => {
    assert.equal(WheelViewData.bar(model(), ui()).expandIcon, "fa-chevron-down");
    assert.equal(WheelViewData.bar(model(), ui({ orientation: "down" })).expandIcon, "fa-chevron-up");
    assert.equal(WheelViewData.bar(model(), ui({ orientation: "right" })).expandIcon, "fa-chevron-left");
    const stats = { total: 3, bySide: {}, standing: 3, hpBySide: null, elapsedSeconds: 0, expiring: [] };
    assert.equal(WheelViewData.bar(model({ stats }), ui({ orientation: "left", expanded: true })).expandIcon, "fa-chevron-left");
  });

  it("offers the four directions, marks the current one and locks them with the widget (RF-12, RF-13)", () => {
    const { orientations } = WheelViewData.bar(model(), ui({ orientation: "left", locked: true }));
    assert.deepEqual(orientations.map((o) => o.value), ["up", "right", "down", "left"]);
    assert.deepEqual(orientations.filter((o) => o.active).map((o) => o.value), ["left"]);
    assert.ok(orientations.every((o) => o.disabled));
  });
});

describe("WheelViewData.bar end turn (RF-10)", () => {
  it("lets a player end only their own turn, and the GM any turn", () => {
    game.user.isGM = false;
    try {
      assert.equal(WheelViewData.bar(model({ canEndOwnTurn: false }), ui()).endTurnLabel, null);
      assert.match(WheelViewData.bar(model({ canEndOwnTurn: true }), ui()).endTurnLabel, /EndOwnTurn/);
    } finally {
      game.user.isGM = true;
    }
    assert.match(WheelViewData.bar(model({ canEndOwnTurn: false }), ui()).endTurnLabel, /EndTurn/);
  });

  it("gives a player nothing to end before the combat starts", () => {
    game.user.isGM = false;
    try {
      assert.equal(WheelViewData.bar(model({ started: false, canEndOwnTurn: true }), ui()).endTurnLabel, null);
    } finally {
      game.user.isGM = true;
    }
  });
});

describe("WheelViewData while setting up (RF-16)", () => {
  const setup = (extra = {}) =>
    model({
      started: false,
      round: 0,
      ring: [vm("a", { hasInitiative: false }), vm("b", { hasInitiative: false }), vm("c", { hasInitiative: false, hasPlayerOwner: true })],
      rolledCount: 0,
      ...extra,
    });

  it("turns the GM's turn button into Start combat, with no way back", () => {
    const bar = WheelViewData.bar(setup(), ui());
    assert.match(bar.endTurnLabel, /StartCombat/);
    assert.equal(bar.endTurnAction, "startCombat");
    assert.equal(bar.endTurnDisabled, false);
    assert.equal(bar.canGoBack, false);
    assert.equal(WheelViewData.bar(setup({ N: 0, ring: [] }), ui()).endTurnDisabled, true, "nobody to fight");
    assert.equal(WheelViewData.bar(model(), ui()).endTurnAction, "endTurn");
  });

  it("puts the GM's group rolls in the bar, each with how many it rolls", () => {
    const bar = WheelViewData.bar(setup(), ui());
    assert.deepEqual(bar.setupRolls.map((r) => [r.group, r.count, r.disabled]), [["all", 3, false], ["npc", 2, false], ["pc", 1, false]]);
    // Nothing to clear yet, so no popover button.
    assert.equal(bar.rollMenu, null);
  });

  it("keeps a rolled group in place, disabled, and leaves only Clear in the popover", () => {
    const ring = [vm("a"), vm("b"), vm("c", { hasInitiative: false, hasPlayerOwner: true })];
    const bar = WheelViewData.bar(setup({ ring, rolledCount: 2 }), ui());
    assert.deepEqual(bar.setupRolls.map((r) => r.disabled), [false, true, false]);
    assert.deepEqual(bar.rollOptions.map((o) => o.group), ["reset"]);
    assert.equal(bar.rollMenu.icon, "fa-rotate-left");
  });

  it("disables the group rolls while a roll is in flight, and hides them with the roll item", () => {
    assert.ok(WheelViewData.bar(setup(), ui({ rolling: true })).setupRolls.every((r) => r.disabled));
    assert.equal(WheelViewData.bar(setup(), ui({ barHidden: ["roll"] })).setupRolls, null);
    assert.equal(WheelViewData.bar(model(), ui()).setupRolls, null, "not once it started");
  });

  it("gives players no group rolls", () => {
    game.user.isGM = false;
    try {
      assert.equal(WheelViewData.bar(setup(), ui()).setupRolls, null);
    } finally {
      game.user.isGM = true;
    }
  });

  it("names the player's own combatant in the hub once they rolled", () => {
    const hub = WheelViewData.hub(setup({ needsRoll: false, focusOwn: true, current: vm("c") }), ui());
    assert.match(hub.label, /Hub\.Yours/);
    assert.equal(hub.name, "c");
  });
});

describe("WheelViewData.bar details (RF-11)", () => {
  it("follows the viewed combatant in combat order", () => {
    const bar = WheelViewData.bar(model({ stats: { total: 3, bySide: {}, standing: 3, hpBySide: null, elapsedSeconds: 0, expiring: [] } }), ui({ expanded: true, viewIndex: 2 }));
    assert.equal(bar.character.name, "c");
    assert.equal(bar.character.viewing, true);
    assert.match(bar.character.position, /3.*3/);
  });
});

describe("WheelViewData under SC Venaerys's Initiative (RF-80, RF-81)", () => {
  const phaseVm = (id, extra = {}) => ({ ...vm(id), kind: "phase", phaseId: id, icon: "fa-solid fa-bolt", color: "#5b86c9", half: null, members: [], memberCount: 2, finishedCount: 1, ...extra });
  const phased = (extra = {}) => {
    const ring = [phaseVm("fast", { members: [vm("hero", { status: "acting", isOwner: true, dispositionKey: "friendly" }), vm("rogue", { status: "done" })] }), phaseVm("enemies")];
    return model({ phased: true, ring, N: 2, current: ring[0], phase: { ...ring[0], acting: ring[0].members }, ...extra });
  };

  it("gives the GM the next phase, and a player Done, then a disabled Finished", () => {
    assert.match(WheelViewData.bar(phased(), ui()).endTurnLabel, /NextPhase/);
    assert.match(WheelViewData.bar(phased(), ui()).previousLabel, /PreviousPhase/);
    game.user.isGM = false;
    try {
      const acting = WheelViewData.bar(phased({ canEndOwnTurn: true }), ui());
      assert.match(acting.endTurnLabel, /Bar\.Finish$/);
      assert.equal(acting.endTurnDisabled, false);
      const moving = WheelViewData.bar(phased({ canEndOwnTurn: true, phase: { half: "move", acting: [] } }), ui());
      assert.match(moving.endTurnLabel, /FinishMove/);
      const finished = WheelViewData.bar(phased({ canEndOwnTurn: false, ownFinished: true }), ui());
      assert.match(finished.endTurnLabel, /Finished/);
      assert.equal(finished.endTurnDisabled, true);
      assert.equal(WheelViewData.bar(phased({ canEndOwnTurn: false, ownFinished: false }), ui()).endTurnLabel, null);
    } finally {
      game.user.isGM = true;
    }
  });

  it("shows the token's art in the strip when asked (RF-82)", () => {
    const ring = [phaseVm("fast", { members: [vm("hero", { status: "acting", img: "portrait.webp", tokenImg: "token.webp" }), vm("rogue", { status: "done", img: "r.webp", tokenImg: null })] })];
    const withToken = phased({ ring, N: 1, current: ring[0], phase: { ...ring[0], acting: ring[0].members } });
    assert.deepEqual(WheelViewData.bar(withToken, ui()).strip.members.map((m) => m.img), ["portrait.webp", "r.webp"]);
    assert.deepEqual(WheelViewData.bar(withToken, ui({ stripImage: "token" })).strip.members.map((m) => m.img), ["token.webp", "r.webp"]);
  });

  it("lines up the current phase's members, marks who finished, and keeps the overview shut", () => {
    const bar = WheelViewData.bar(phased(), ui());
    assert.deepEqual(bar.strip.members.map((m) => [m.id, m.isDone]), [["hero", false], ["rogue", true]]);
    assert.equal(bar.strip.members[0].isOwner, true);
    assert.equal(bar.canOpenGrid, false);
    assert.equal(WheelViewData.bar(model(), ui()).strip, null);
  });

  it("gives each owned member a done toggle only when Venaerys takes the marks", () => {
    assert.deepEqual(WheelViewData.bar(phased(), ui()).strip.members.map((m) => m.doneToggle), [null, null]);
    const toggles = WheelViewData.bar(phased(), ui({ canMarkDone: true })).strip.members.map((m) => m.doneToggle);
    assert.equal(toggles[0].pressed, false);
    assert.match(toggles[0].label, /Phase\.MarkDone/);
    // The rogue is not the user's own.
    assert.equal(toggles[1], null);
    const owned = phased();
    owned.phase.acting = [vm("hero", { status: "done", isOwner: true }), vm("ogre", { status: "defeated", isOwner: true })];
    owned.phase.half = "move";
    const [done, defeated] = WheelViewData.bar(owned, ui({ canMarkDone: true })).strip.members.map((m) => m.doneToggle);
    assert.equal(done.pressed, true);
    assert.match(done.label, /Phase\.UnmarkMoved/);
    assert.equal(defeated, null);
  });

  it("names the phase and its progress in the hub", () => {
    const hub = WheelViewData.hub(phased(), ui());
    assert.equal(hub.name, "fast");
    assert.equal(hub.icon, "fa-solid fa-bolt");
    assert.equal(hub.hp.width, "50%");
    assert.equal(WheelViewData.hub(phased({ activeHidden: true }), ui()).waiting, true);
  });
});

describe("WheelViewData.bar tools (RF-83)", () => {
  it("puts the tools in the bar unless the menu is chosen", () => {
    assert.equal(WheelViewData.bar(model(), ui()).inline, true);
    assert.equal(WheelViewData.bar(model(), ui({ controls: "menu" })).inline, false);
    assert.equal(WheelViewData.bar(model(), ui({ menu: "direction" })).directionOpen, true);
  });

  it("only offers the details when they are turned on", () => {
    const bar = WheelViewData.bar(model(), ui({ details: false, expanded: true }));
    assert.equal(bar.details, false);
    assert.equal(bar.expanded, false);
    assert.equal(bar.character, undefined);
  });

  it("keeps the tools in the columns of a split bar, and offers it no details (RF-104)", () => {
    const bar = WheelViewData.bar(model(), ui({ layout: "split", details: true, expanded: true }));
    assert.equal(bar.split, true);
    assert.equal(bar.inline, true);
    assert.equal(bar.details, false);
    assert.equal(bar.expanded, false);
  });

  it("offers no roll once everyone rolled, and clearing only once someone did", () => {
    const rolled = WheelViewData.bar(model(), ui());
    assert.deepEqual(rolled.rollOptions.map((o) => o.group), ["reset"]);
    // The inline button still opens the menu, now for clearing.
    assert.match(rolled.rollMenu.label, /RollMenu\.Reset/);
    assert.equal(rolled.rollMenu.icon, "fa-rotate-left");
    const pending = model({ ring: [vm("a", { hasInitiative: false }), vm("b", { hasInitiative: false, hasPlayerOwner: true })], rolledCount: 0 });
    const bar = WheelViewData.bar(pending, ui());
    assert.match(bar.rollMenu.label, /RollMenu\.Title/);
    assert.deepEqual(bar.rollOptions.map((o) => o.group), ["all", "npc", "pc"]);
  });

  it("offers virtual positions to the GM only when there are templates, never among phases", () => {
    assert.equal(WheelViewData.bar(model(), ui()).canAddVirtual, false);
    assert.equal(WheelViewData.bar(model(), ui({ virtualTemplates: [{ id: "lair" }] })).canAddVirtual, true);
    assert.equal(WheelViewData.bar(model({ phased: true }), ui({ virtualTemplates: [{ id: "lair" }] })).canAddVirtual, false);
  });
});

describe("WheelViewData.bar style switcher (RF-110)", () => {
  const savedStyles = [{ id: "deep", name: "Underwater", current: true }, { id: "boss", name: "Boss", current: false }];

  it("lists the saved styles for the GM, the current one marked", () => {
    const bar = WheelViewData.bar(model(), ui({ savedStyles }));
    assert.equal(bar.styleMenu, true);
    assert.deepEqual(bar.styles.map((style) => [style.id, style.current]), [["deep", true], ["boss", false]]);
    assert.equal(WheelViewData.bar(model(), ui({ savedStyles, menu: "style" })).styleOpen, true);
  });

  it("keeps the switcher for the GM with nothing saved yet, to say where to save one", () => {
    const bar = WheelViewData.bar(model(), ui());
    assert.equal(bar.styleMenu, true);
    assert.deepEqual(bar.styles, []);
  });

  it("offers nothing to players, or once the user hides it", () => {
    assert.equal(WheelViewData.bar(model(), ui({ savedStyles, barHidden: ["style"] })).styleMenu, false);
    game.user.isGM = false;
    try {
      assert.equal(WheelViewData.bar(model(), ui({ savedStyles })).styleMenu, false);
    } finally {
      game.user.isGM = true;
    }
  });
});

describe("WheelViewData.bar items (RF-99)", () => {
  it("leaves out what the user turned off, rolls included", () => {
    const pending = model({ ring: [vm("a", { hasInitiative: false })], rolledCount: 0 });
    const bar = WheelViewData.bar(pending, ui({ barHidden: ["roll", "grid"] }));
    assert.equal(bar.show.grid, false);
    assert.equal(bar.show.lock, true);
    assert.equal(bar.rollMenu, null);
  });
});
