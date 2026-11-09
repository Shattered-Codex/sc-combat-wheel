/**
 * RF-121: what the turn announcement shows for one user after a real turn
 * change — whose turn it is, whether it is theirs, and the portraits to
 * draw (under SC Venaerys's Initiative, everyone in the phase). It reads the
 * WheelModel this user was given, so hidden combatants and the character
 * art a player may not see never get here. Pure: no DOM, no Foundry globals.
 */

/** "auto": the GM hears of every turn, a player of their own. */
export function announceModeFor(mode, isGM) {
  if (mode === "auto" || !mode) return isGM ? "all" : "own";
  return mode;
}

/**
 * The picture of a combatant the look asks for: the character's art (if this
 * user may see it), the token, or none. A combatant with no picture gets null
 * and is drawn by their initials; the look's "none" also sets
 * `portraits: false` on the announcement — no portrait at all, and nothing
 * around it.
 */
function pictureOf(vm, image) {
  if (image === "none") return null;
  if (image === "token") return vm.tokenImg ?? vm.img ?? null;
  return vm.artImg ?? vm.img ?? null;
}

function drawsPortraits(image) {
  return image !== "none";
}

function actorOf(vm, image, extra = {}) {
  return { id: vm.id, name: vm.name, initials: vm.initials ?? "", img: pictureOf(vm, image), dispositionKey: vm.dispositionKey ?? "neutral", ...extra };
}

/**
 * For the GM "their own" turn is an NPC's, one no player owns; for a player,
 * a combatant they own.
 */
function isOwnFor(vm, isGM) {
  return isGM ? !vm.hasPlayerOwner : Boolean(vm.isOwner);
}

/**
 * @param {object|null} model      the WheelModel after the change, as this user sees it
 * @param {object} options
 * @param {boolean} options.isGM
 * @param {string} [options.mode]  "auto" | "own" | "all" | "off"
 * @param {string} [options.image] "actor" | "token" | "none"
 * @returns {null | { kind: "turn"|"phase", own: boolean, name: string, portraits: boolean, phase?: object, actors: object[] }}
 */
export function announcementFor(model, { isGM, mode = "auto", image = "actor" } = {}) {
  const resolved = announceModeFor(mode, isGM);
  // Before round 1 (also after "previous turn" took the first turn back to setup) nobody's turn has come.
  if (resolved === "off" || !model?.started || !model.current || model.activeHidden) return null;
  if (model.phased) {
    const phase = model.phase;
    if (!phase?.acting?.length) return null;
    const live = phase.acting.filter((member) => member.status !== "defeated");
    const own = live.some((member) => isOwnFor(member, isGM));
    if (resolved === "own" && !own) return null;
    return {
      kind: "phase",
      own,
      name: phase.name,
      portraits: drawsPortraits(image),
      phase: { name: phase.name, icon: phase.icon ?? null, color: phase.color ?? null, half: phase.half ?? null },
      actors: phase.acting.map((member) => actorOf(member, image, { dimmed: member.status === "done" || member.status === "defeated" })),
    };
  }
  const vm = model.current;
  // A virtual position has its own message (RF-68).
  if (vm.virtual) return null;
  const own = isOwnFor(vm, isGM);
  if (resolved === "own" && !own) return null;
  return { kind: "turn", own, name: vm.name, portraits: drawsPortraits(image), actors: [actorOf(vm, image)] };
}

/**
 * A player's "you are up next", or null: the next turn (or phase) is one of
 * theirs and not the one acting now. The GM has no next up of their own.
 */
export function nextUpFor(model, { isGM, image = "actor" } = {}) {
  const next = model?.nextUp;
  if (isGM || !model.started || !next?.isOwner || next.virtual || next.id === model.current?.id) return null;
  const portraits = drawsPortraits(image);
  if (model.phased) return { kind: "phase", own: true, name: next.name, portraits, phase: { name: next.name, icon: next.icon ?? null, color: next.color ?? null, half: null }, actors: [] };
  return { kind: "turn", own: true, name: next.name, portraits, actors: [actorOf(next, image)] };
}
