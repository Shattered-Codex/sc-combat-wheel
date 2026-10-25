import CombatantAdapter from "./CombatantAdapter.js";
import { isOnRing } from "../helpers/visibility-rules.js";

/**
 * Projects a Combat into what one user may see on the wheel (ARCHITECTURE §2).
 * Pure: every global it needs arrives through `context`.
 */
export default class CombatProjector {
  /**
   * @param {Combat|null} combat
   * @param {object} context  { isGM, settings, unknownName, isVideo }
   *   settings: { portraitSource, hpForPlayers, npcNames, defeatedMode, concealment, secondsPerRound }
   * @returns {object|null} WheelModel
   */
  static project(combat, context) {
    if (!combat) return null;
    const { isGM, settings } = context;
    const turns = Array.from(combat.turns ?? []);
    const round = Number.isInteger(combat.round) ? combat.round : 0;
    const turn = Number.isInteger(combat.turn) ? combat.turn : 0;
    const started = Boolean(combat.started ?? round > 0);
    const vmContext = { ...context, round };

    const ring = [];
    const ringIndexByTurn = new Map();
    turns.forEach((combatant, turnIndex) => {
      const vm = CombatantAdapter.toViewModel(combatant, vmContext);
      if (!isOnRing(vm, { isGM, defeatedMode: settings.defeatedMode })) return;
      ringIndexByTurn.set(turnIndex, ring.length);
      ring.push(vm);
    });

    const N = ring.length;
    const { currentIndex, effectiveRound, activeHidden } = CombatProjector.#locateTurn({
      turn,
      round,
      started,
      turnCount: turns.length,
      ringIndexByTurn,
    });
    const current = N ? ring[currentIndex] : null;
    // Virtual positions have a fixed initiative and are nobody's roll (RF-66).
    const rollable = ring.filter((vm) => !vm.virtual);
    const pending = rollable.filter((vm) => !vm.hasInitiative);

    return {
      combatId: combat.id,
      round,
      turn,
      started,
      ring,
      N,
      currentIndex,
      current,
      activeHidden,
      T: N ? (effectiveRound - 1) * N + currentIndex : 0,
      turnLabel: N ? `${currentIndex + 1}/${N}` : "0/0",
      nextUp: N > 1 ? ring[(currentIndex + 1) % N] : null,
      needsRoll: pending.length > 0 && round <= 1,
      rolledCount: rollable.length - pending.length,
      rollTotal: rollable.length,
      pendingIds: pending.map((vm) => vm.id),
      pendingOwnIds: pending.filter((vm) => isGM || vm.isOwner).map((vm) => vm.id),
      canEndOwnTurn: Boolean(started && !activeHidden && current?.isOwner),
      stats: CombatProjector.stats(rollable, { isGM, round, secondsPerRound: settings.secondsPerRound }),
    };
  }

  /**
   * RF-43: when the active combatant is not on this ring, anchor on the next
   * visible one — wrapping into the next round if nobody visible is left.
   */
  static #locateTurn({ turn, round, started, turnCount, ringIndexByTurn }) {
    const effectiveRound = Math.max(1, round);
    if (ringIndexByTurn.has(turn)) {
      return { currentIndex: ringIndexByTurn.get(turn), effectiveRound, activeHidden: false };
    }
    if (!ringIndexByTurn.size) return { currentIndex: 0, effectiveRound, activeHidden: false };
    for (let i = turn + 1; i < turnCount; i++) {
      if (ringIndexByTurn.has(i)) {
        return { currentIndex: ringIndexByTurn.get(i), effectiveRound, activeHidden: started };
      }
    }
    return { currentIndex: 0, effectiveRound: effectiveRound + 1, activeHidden: started };
  }

  /** SPEC §5.3, over real combatants only. Hit point sums only reach the GM. Shared with PhaseProjector. */
  static stats(ring, { isGM, round, secondsPerRound }) {
    const bySide = { friendly: 0, neutral: 0, hostile: 0, secret: 0 };
    const hpBySide = {};
    const expiring = [];
    for (const vm of ring) {
      bySide[vm.dispositionKey] += 1;
      if (isGM && vm.hpTotal) {
        const side = (hpBySide[vm.dispositionKey] ??= { value: 0, max: 0 });
        side.value += vm.hpTotal.value;
        side.max += vm.hpTotal.max;
      }
      for (const effect of vm.effects) {
        if (effect.rounds === 0) expiring.push({ combatant: vm.name, name: effect.name, img: effect.img });
      }
    }
    return {
      total: ring.length,
      bySide,
      standing: ring.filter((vm) => vm.alive).length,
      hpBySide: isGM ? hpBySide : null,
      elapsedSeconds: Math.max(0, round - 1) * (secondsPerRound || 6),
      expiring,
    };
  }
}
