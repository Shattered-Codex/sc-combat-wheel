import { MODULE_ID, SETTINGS } from "../constants/module-constants.js";
import { appearanceValues, getSetting, tableLockedKeys, withLockedValues } from "../hooks/register-settings.js";
import { cardOf, withCard } from "../helpers/announce-card.js";

const FLAG = "announceCard";
/** A save in the editor changes many settings at once: one write for all of them. */
const SYNC_DELAY_MS = 500;

/**
 * RF-123: each player's announcement card, kept in a flag on their User so
 * every client can read it. A player writes only their own, and only when it
 * changed; the GM shares none (an NPC's turn is drawn with each viewer's look).
 */
export default class AnnouncementCards {
  static #timer = null;

  static scheduleSync() {
    clearTimeout(AnnouncementCards.#timer);
    AnnouncementCards.#timer = setTimeout(() => AnnouncementCards.sync(), SYNC_DELAY_MS);
  }

  /** Publishes this player's card as their look draws it now (table look and locks included), or takes it down. */
  static async sync() {
    const user = game.user;
    if (!user || user.isGM) return;
    const card = cardOf(appearanceValues());
    const stored = user.getFlag(MODULE_ID, FLAG) ?? null;
    if (JSON.stringify(card) === JSON.stringify(stored)) return;
    try {
      if (card) await user.setFlag(MODULE_ID, FLAG, card);
      else await user.unsetFlag(MODULE_ID, FLAG);
    } catch (error) {
      console.warn(`${MODULE_ID} | could not share the announcement card`, error);
    }
  }

  /**
   * A viewer's look with the card `userId` shares, as far as the table allows
   * it now — whatever the stored card says, since it may predate the GM's
   * choice or have been written by hand: none while the GM makes everyone use
   * the table look, and never over an option the GM locked.
   */
  static lookWith(userId, look) {
    const mode = getSetting(SETTINGS.tableLookMode);
    if (mode === "forced") return look;
    const drawn = withCard(look, AnnouncementCards.cardOf(userId));
    return mode === "partial" ? withLockedValues(drawn, tableLockedKeys()) : drawn;
  }

  /** The card a player shares, or null. */
  static cardOf(userId) {
    const user = game.users?.get(userId);
    if (!user || user.isGM) return null;
    return user.getFlag(MODULE_ID, FLAG) ?? null;
  }
}
