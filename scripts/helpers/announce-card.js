import { SETTINGS } from "../constants/module-constants.js";
import { SETTINGS_SCHEMA, coerceSetting } from "../constants/settings-schema.js";

/**
 * RF-123: the part of a look a player's card carries to the table — how the
 * announcement looks. When it shows, where, how big and for how long stay
 * each viewer's, and so does the title (a player's "My turn!" would read
 * wrong to the others, who see "{name}'s turn"). Pure: no Foundry globals.
 */
export const CARD_KEYS = Object.freeze([
  SETTINGS.announceImage,
  SETTINGS.announceFrame,
  SETTINGS.announceBorder,
  SETTINGS.announceStyle,
  SETTINGS.announceEntrance,
  SETTINGS.announceColor,
  SETTINGS.announceCustomColor,
  SETTINGS.announceEffect,
  SETTINGS.announceParticles,
  SETTINGS.announceIntensity,
]);

const CARD_ENTRIES = SETTINGS_SCHEMA.filter((entry) => CARD_KEYS.includes(entry.key));
/** What a card's value may be at all: a flag can hold any object, and turning one into text can throw. */
const PLAIN_TYPES = new Set(["string", "number", "boolean"]);

/** The card this look shares with the table, or null when it shares none. */
export function cardOf(look) {
  if (!look?.[SETTINGS.announceShareCard]) return null;
  return Object.fromEntries(CARD_KEYS.map((key) => [key, look[key]]));
}

/**
 * A viewer's look with another player's card over it. The card was written
 * by that player, so every value is checked against its setting; a missing,
 * non-plain or invalid one keeps the viewer's.
 */
export function withCard(look, card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return look;
  const values = { ...look };
  for (const entry of CARD_ENTRIES) {
    if (!Object.hasOwn(card, entry.key)) continue;
    const raw = card[entry.key];
    if (!PLAIN_TYPES.has(typeof raw)) continue;
    const value = coerceSetting(entry, raw);
    if (value !== null) values[entry.key] = value;
  }
  return values;
}
