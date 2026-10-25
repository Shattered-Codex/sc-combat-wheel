import { I18N_ROOT, SETTINGS } from "../constants/module-constants.js";
import { getSetting } from "../hooks/register-settings.js";
import { soundEventFor } from "../helpers/turn-events.js";
import SoundPlayer from "./SoundPlayer.js";
import TokenInteractions from "./TokenInteractions.js";

/** Which setting pair (choice, file) each sound event reads (RF-52). */
export const SOUND_SETTINGS = Object.freeze({
  turnChange: [SETTINGS.soundTurnChange, SETTINGS.soundTurnChangeFile],
  ownTurn: [SETTINGS.soundOwnTurn, SETTINGS.soundOwnTurnFile],
  nextUp: [SETTINGS.soundNextUp, SETTINGS.soundNextUpFile],
  roundStart: [SETTINGS.soundRoundStart, SETTINGS.soundRoundStartFile],
  combatStart: [SETTINGS.soundCombatStart, SETTINGS.soundCombatStartFile],
  turnBack: [SETTINGS.soundTurnBack, SETTINGS.soundTurnBackFile],
  combatEnd: [SETTINGS.soundCombatEnd, SETTINGS.soundCombatEndFile],
});

/**
 * Local reactions to a real turn change, with or without the wheel open:
 * the turn sound, camera follow and the "up next" notice.
 */
export default class TurnSideEffects {
  static player = new SoundPlayer();

  /**
   * @param {Combat} combat
   * @param {object} model                              WheelModel after the change
   * @param {{round:number, turn:number}} previous      position before it
   */
  static onTurnChanged(combat, model, previous) {
    const turnBack = getSetting(SETTINGS.soundTurnBack) !== "off";
    TurnSideEffects.#playSound(soundEventFor(previous, model, { isGM: game.user.isGM, turnBack }));
    if (!model?.current || model.activeHidden) return;
    if (getSetting(SETTINGS.cameraFollows)) TokenInteractions.panToCombatant(combat, model.current.id);
    TurnSideEffects.#notifyNextUp(model);
  }

  /** RF-101: a combat that had started is over (deleted) — its closing sound, on every client. */
  static onCombatEnded(combat) {
    if ((combat?.round ?? 0) > 0) TurnSideEffects.#playSound("combatEnd");
  }

  /** Plays the sound configured for `event` (also used by the settings "test" buttons). */
  static playEvent(event, overrides = {}) {
    const [choiceKey, fileKey] = SOUND_SETTINGS[event] ?? [];
    if (!choiceKey) return Promise.resolve(false);
    const choice = overrides.choice ?? getSetting(choiceKey);
    const file = overrides.file ?? getSetting(fileKey);
    const volume = (overrides.volume ?? getSetting(SETTINGS.soundVolume)) / 100;
    return TurnSideEffects.player.play(choice, file, volume);
  }

  static #playSound(event) {
    if (!event || !getSetting(SETTINGS.soundsAllowed)) return;
    TurnSideEffects.playEvent(event);
  }

  static #notifyNextUp(model) {
    const next = model.nextUp;
    if (game.user.isGM || !next?.isOwner || next.virtual || next.id === model.current.id) return;
    if (!getSetting(SETTINGS.nextUpNotice)) return;
    const key = model.phased ? "Notifications.PhaseNextUp" : "Notifications.NextUp";
    ui.notifications.info(game.i18n.format(`${I18N_ROOT}.${key}`, { name: next.name }));
  }
}
