import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { announceModeFor, announcementFor, nextUpFor } from "../scripts/helpers/turn-announcement.js";

const vm = (id, extra = {}) => ({ id, name: id, initials: id.slice(0, 2), img: `slice/${id}`, tokenImg: `token/${id}`, artImg: `art/${id}`, dispositionKey: "hostile", isOwner: false, hasPlayerOwner: false, ...extra });
const model = (current, extra = {}) => ({ current, nextUp: null, started: true, activeHidden: false, ...extra });
const hero = vm("hero", { isOwner: true, hasPlayerOwner: true, dispositionKey: "friendly" });
const goblin = vm("goblin");

describe("turn announcement (RF-121)", () => {
  it("tells the GM of every turn and a player of their own by default", () => {
    assert.equal(announceModeFor("auto", true), "all");
    assert.equal(announceModeFor("auto", false), "own");
    assert.equal(announceModeFor("off", false), "off");
  });

  it("announces a player's own turn, and someone else's only when asked", () => {
    const own = announcementFor(model(hero), { isGM: false });
    assert.deepEqual([own.kind, own.own, own.name, own.actors[0].img], ["turn", true, "hero", "art/hero"]);
    assert.equal(announcementFor(model(goblin), { isGM: false }), null);
    const other = announcementFor(model(goblin), { isGM: false, mode: "all" });
    assert.equal(other.own, false);
    assert.equal(announcementFor(model(hero), { isGM: false, mode: "off" }), null);
  });

  it("counts an NPC's turn as the GM's own", () => {
    assert.equal(announcementFor(model(goblin), { isGM: true, mode: "own" }).own, true);
    assert.equal(announcementFor(model(hero), { isGM: true, mode: "own" }), null);
  });

  it("never names a turn the player cannot see, nor a virtual position", () => {
    assert.equal(announcementFor(model(hero, { activeHidden: true }), { isGM: false, mode: "all" }), null);
    assert.equal(announcementFor(model(vm("lair", { virtual: true })), { isGM: true }), null);
    assert.equal(announcementFor(null, { isGM: true }), null);
  });

  it("announces nothing before the combat starts, nor once it is taken back to setup", () => {
    const setup = model(hero, { started: false, nextUp: hero });
    assert.equal(announcementFor(setup, { isGM: false }), null);
    assert.equal(announcementFor(setup, { isGM: true, mode: "all" }), null);
    assert.equal(nextUpFor(model(goblin, { started: false, nextUp: hero }), { isGM: false }), null);
    const phase = { name: "Fast", acting: [{ ...hero, status: "acting" }] };
    assert.equal(announcementFor({ phased: true, started: false, current: {}, phase }, { isGM: false }), null);
  });

  it("draws the picture the look asks for", () => {
    const picture = (image) => announcementFor(model(hero), { isGM: false, image }).actors[0].img;
    assert.equal(picture("actor"), "art/hero");
    assert.equal(picture("token"), "token/hero");
    assert.equal(picture("none"), null);
    const noArt = announcementFor(model({ ...hero, artImg: null }), { isGM: false }).actors[0].img;
    assert.equal(noArt, "slice/hero", "falls back to the slice's picture");
  });

  it("tells a missing picture (initials) from the look's 'none' (no portrait at all)", () => {
    const bare = announcementFor(model({ ...hero, img: null, artImg: null, tokenImg: null }), { isGM: false });
    assert.deepEqual([bare.portraits, bare.actors[0].img], [true, null]);
    const none = announcementFor(model(hero), { isGM: false, image: "none" });
    assert.equal(none.portraits, false);
    assert.equal(none.actors.length, 1, "the colour still follows the actor's side");
    assert.equal(nextUpFor(model(goblin, { nextUp: hero }), { isGM: false, image: "none" }).portraits, false);
    assert.equal(nextUpFor(model(goblin, { nextUp: hero }), { isGM: false }).portraits, true);
    const phase = { name: "Fast", acting: [{ ...hero, status: "acting" }] };
    assert.equal(announcementFor({ phased: true, started: true, current: {}, phase }, { isGM: false, image: "none" }).portraits, false);
  });

  it("lines up everyone of a Venaerys phase, the finished ones dimmed", () => {
    const phase = { name: "Fast", icon: "fa-bolt", color: "#3f8fd2", half: "act", acting: [{ ...hero, status: "acting" }, { ...goblin, status: "done" }, { ...vm("bandit"), status: "defeated" }] };
    const announcement = announcementFor({ phased: true, started: true, current: {}, activeHidden: false, phase }, { isGM: false });
    assert.equal(announcement.kind, "phase");
    assert.equal(announcement.own, true);
    assert.deepEqual(announcement.actors.map((actor) => [actor.id, Boolean(actor.dimmed)]), [["hero", false], ["goblin", true], ["bandit", true]]);
    assert.deepEqual(announcement.phase, { name: "Fast", icon: "fa-bolt", color: "#3f8fd2", half: "act" });
    const theirs = { ...phase, acting: [{ ...goblin, status: "acting" }] };
    assert.equal(announcementFor({ phased: true, started: true, current: {}, phase: theirs }, { isGM: false }), null, "not the player's phase");
  });

  it("tells a player they are next, never the GM", () => {
    const next = nextUpFor(model(goblin, { nextUp: hero }), { isGM: false });
    assert.deepEqual([next.own, next.name], [true, "hero"]);
    assert.equal(nextUpFor(model(goblin, { nextUp: hero }), { isGM: true }), null);
    assert.equal(nextUpFor(model(hero, { nextUp: hero }), { isGM: false }), null, "already acting");
    assert.equal(nextUpFor(model(hero, { nextUp: goblin }), { isGM: false }), null);
  });
});
