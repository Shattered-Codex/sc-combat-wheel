/**
 * #15: how a defeated combatant looks, set by the table for NPCs and for
 * player characters apart. Only the picture: who is removed from the wheel
 * (defeatedMode), whose turn is skipped (skipDead), the hit points and
 * Foundry's defeated mark never change with it. Pure.
 */

/** The skull over the portrait, the portrait turned grey, both, or neither. */
export const DEFEATED_LOOKS = Object.freeze(["skullGrey", "skull", "grey", "none"]);

/** What shows it: Foundry's defeated mark, hit points down to 0, or either. */
export const DEFEATED_TRIGGERS = Object.freeze(["either", "flag", "hp"]);

/**
 * Whose policy a combatant follows: "pc" when a player owns it (their
 * character, and the companions and summons they control), "npc" otherwise.
 * The same line Foundry draws with `hasPlayerOwner`, in every system.
 */
export function defeatedGroupOf({ hasPlayerOwner }) {
  return hasPlayerOwner ? "pc" : "npc";
}

/**
 * What this viewer sees of a combatant's defeat. `down` is what the hit
 * points this viewer may know say (secret hit points never show it), so
 * the look gives nothing away the health display does not.
 * @returns {{ shown: boolean, skull: boolean, grey: boolean }}
 *   `shown`: it counts as defeated for the picture and its label.
 */
export function defeatedLook({ defeated, down }, { look = "skullGrey", trigger = "either" } = {}) {
  const shown = trigger === "flag" ? Boolean(defeated) : trigger === "hp" ? Boolean(down) : Boolean(defeated || down);
  return {
    shown,
    skull: shown && (look === "skullGrey" || look === "skull"),
    grey: shown && (look === "skullGrey" || look === "grey"),
  };
}

/**
 * The look on a slice or an overview tile: `is-defeated` (no health gauge or
 * hit point label, as before) only while there is a look to show — with
 * none, a combatant at 0 reads like any other.
 */
export function applyDefeatedLook(element, vm) {
  const skull = Boolean(vm?.defeatedSkull);
  const grey = Boolean(vm?.defeatedGrey);
  element.classList.toggle("is-defeated", skull || grey);
  element.classList.toggle("is-defeated-skull", skull);
  element.classList.toggle("is-defeated-grey", grey);
}
