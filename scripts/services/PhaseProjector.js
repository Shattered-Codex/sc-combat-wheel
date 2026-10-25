import CombatProjector from "./CombatProjector.js";
import CombatantAdapter from "./CombatantAdapter.js";
import { isOnRing } from "../helpers/visibility-rules.js";
import {
  currentHalfOf,
  currentPhaseIdOf,
  memberProgress,
  phaseName,
  phasePlanOf,
  venaerysFlags,
} from "../helpers/venaerys-phases.js";

/** What a player's wheel shows for a current phase it sees nobody in: no name, no members (as Venaerys does). */
const WAITING_ICON = "fa-solid fa-hourglass-half";

/**
 * Projects a combat run by SC Venaerys's Initiative into a WheelModel whose
 * ring is made of phases (RF-80): one slice per phase this user sees someone
 * in, turning one slice per phase, and `phase` holding everyone who acts in
 * the current one. Members are combatant view models, so names, portraits,
 * concealment and hit points follow the same rules as the ordinary wheel.
 * Pure: every global arrives through `context`.
 */
export default class PhaseProjector {
  /**
   * @param {Combat|null} combat
   * @param {object} context  CombatProjector's context, plus `localize(key)` for phase names
   * @returns {object|null} WheelModel with `phased: true`, or null when the combat is not phased or not started
   */
  static project(combat, context) {
    const plan = phasePlanOf(combat);
    if (!plan || !(combat.round > 0)) return null;
    const { isGM, settings } = context;
    const round = combat.round;
    const currentId = currentPhaseIdOf(combat, plan);
    const vmContext = { ...context, round };
    const onRing = (vm) => isOnRing(vm, { isGM, defeatedMode: settings.defeatedMode });

    const membersByPhase = new Map(plan.map((phase) => [phase.id, []]));
    const everyone = [];
    for (const combatant of combat.turns ?? []) {
      const vm = CombatantAdapter.toViewModel(combatant, vmContext);
      if (!onRing(vm)) continue;
      everyone.push(vm);
      membersByPhase.get(venaerysFlags(combatant).phase)?.push({ vm, combatant });
    }

    const ring = [];
    for (const phase of plan) {
      const isCurrent = phase.id === currentId;
      const half = isCurrent ? currentHalfOf(combat, phase) : null;
      const members = membersByPhase.get(phase.id).map(({ vm, combatant }) => PhaseProjector.#member(vm, combatant, { round, half, isCurrent }));
      if (members.length) ring.push(PhaseProjector.#phaseView(phase, members, { half, localize: context.localize }));
      else if (isCurrent) ring.push(PhaseProjector.#waitingView(phase, context.waitingName));
    }

    const N = ring.length;
    const found = ring.findIndex((entry) => entry.phaseId === currentId);
    const currentIndex = Math.max(found, 0);
    const current = N ? ring[currentIndex] : null;
    const acting = current && !current.waiting ? current.members : [];
    const own = acting.filter((member) => member.isOwner && !member.dead && !(isGM && member.hasPlayerOwner));
    return {
      combatId: combat.id,
      phased: true,
      round,
      turn: combat.turn,
      started: true,
      ring,
      N,
      currentIndex,
      current,
      // The pointer rests on no phase this user can name (a pending combatant): show the wait, not a phase.
      activeHidden: found === -1,
      T: N ? (round - 1) * N + currentIndex : 0,
      turnLabel: N ? `${currentIndex + 1}/${N}` : "0/0",
      nextUp: N > 1 ? ring[(currentIndex + 1) % N] : null,
      // Nobody to line up when this user sees no one in the current phase.
      phase: current && found !== -1 && !current.waiting ? { ...current, acting } : null,
      needsRoll: false,
      rolledCount: 0,
      rollTotal: 0,
      pendingIds: [],
      pendingOwnIds: [],
      // A player's "Done" button: marks what they still have acting in this phase (or half).
      canEndOwnTurn: own.some((member) => member.status === "acting"),
      ownFinished: own.length > 0 && own.every((member) => member.status !== "acting"),
      stats: CombatProjector.stats(everyone.filter((vm) => !vm.virtual), { isGM, round, secondsPerRound: settings.secondsPerRound }),
    };
  }

  static #member(vm, combatant, { round, half, isCurrent }) {
    let status = "waiting";
    if (vm.dead) status = "defeated";
    else if (isCurrent) status = memberProgress(combatant, { round, half });
    else if (memberProgress(combatant, { round, half: null }) === "done") status = "done";
    return { ...vm, status };
  }

  static #phaseView(phase, members, { half, localize }) {
    const finished = members.filter((member) => member.status === "done" || member.status === "defeated").length;
    return {
      ...PhaseProjector.#sliceBase(phase),
      name: phaseName(phase, localize),
      icon: phase.icon,
      color: phase.color,
      half,
      members,
      memberCount: members.length,
      finishedCount: finished,
      // "Own turn" and "next up" (sounds, notice) mean the phase of one of the user's combatants.
      isOwner: members.some((member) => member.isOwner && !member.dead),
      hasPlayerOwner: members.some((member) => member.hasPlayerOwner),
    };
  }

  static #waitingView(phase, waitingName) {
    return {
      ...PhaseProjector.#sliceBase(phase),
      waiting: true,
      name: waitingName,
      icon: WAITING_ICON,
      color: null,
      half: null,
      members: [],
      memberCount: 0,
      finishedCount: 0,
      isOwner: false,
      hasPlayerOwner: false,
    };
  }

  /** The fields the renderer reads of any slice, set for a phase. */
  static #sliceBase(phase) {
    return {
      id: `phase:${phase.id}`,
      kind: "phase",
      phaseId: phase.id,
      waiting: false,
      virtual: false,
      img: null,
      imgPosition: "50% 50%",
      initials: "",
      initiative: null,
      hasInitiative: true,
      dispositionKey: "phase",
      concealed: false,
      defeated: false,
      dead: false,
      alive: true,
      players: [],
      hp: { mode: "none", pct: 0, critical: false },
      healthTone: null,
      effects: [],
    };
  }
}
