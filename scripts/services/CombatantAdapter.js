import { DISPOSITION, DISPOSITION_KEYS, MODULE_ID } from "../constants/module-constants.js";
import { hpView, initialsOf, isConcealed, isDeadForViewer, isDownForViewer, shouldSkipTurn, visibleName } from "../helpers/visibility-rules.js";
import { defeatedGroupOf, defeatedLook } from "../helpers/defeated-look.js";
import { virtualFlagOf } from "../helpers/virtual-positions.js";
import { INITIATIVE_SHOWN_FLAG, isInitiativeHidden } from "../helpers/initiative-reveal.js";
import { IDENTITY_REVEALED_FLAG, isIdentityHidden, unidentifiedViewModel } from "../helpers/identity-reveal.js";
import { healthTone, readHealth } from "../helpers/health-source.js";

const DEFAULT_HEALTH_SOURCE = { kind: "bar", bar: "bar1" };

const DEFAULT_IMAGE_POSITION = "50% 20%";
/** Foundry's CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, kept here so the adapter reads no globals. */
const OWNERSHIP_LIMITED = 1;

/**
 * Translates a Combatant into the view model the wheel draws (ARCHITECTURE §2).
 * It only reads document properties, so tests can feed it plain objects.
 */
export default class CombatantAdapter {
  /**
   * @param {object} context
   * @param {boolean} context.isGM
   * @param {number} context.round            current combat round, for effect durations
   * @param {object} context.settings         { portraitSource, hpForPlayers, npcNames, hideEnemyInitiative, concealEnemyIdentity, defeatedLook }
   *   defeatedLook: { npc: { look, trigger }, pc: { look, trigger } } (#15)
   * @param {string} context.unknownName      label for names the viewer may not read
   * @param {(src: string) => boolean} [context.isVideo]
   * @param {object} [context.healthSource]   from healthSourceFor(); token bar 1 by default
   * @param {{ids: Set<string>, skipDead: string}} [context.acting]  who acts now (#14), and the dead-turn rule that passes over them
   */
  static toViewModel(combatant, context) {
    const { isGM, settings } = context;
    const token = combatant.token ?? null;
    const disposition = token?.disposition ?? DISPOSITION.NEUTRAL;
    const isOwner = Boolean(combatant.isOwner);
    const name =
      visibleName(combatant.name, {
        isGM,
        isOwner,
        npcNames: settings.npcNames,
        tokenDisplayName: token?.displayName,
      }) ?? context.unknownName;
    const revealActor = isGM || CombatantAdapter.#canSeeActor(combatant);
    const portrait = CombatantAdapter.portraitFor(combatant, settings.portraitSource, context.isVideo, { revealActor });
    const initiative = Number.isFinite(combatant.initiative) ? combatant.initiative : null;
    const virtual = virtualFlagOf(combatant) !== null;
    // #11: an enemy's number stays the GM's until its turn shows it; the turn order itself is Foundry's to show.
    const initiativeHidden = isInitiativeHidden(
      { initiative, shown: combatant.flags?.[MODULE_ID]?.[INITIATIVE_SHOWN_FLAG], disposition, isOwner, virtual },
      { isGM, hideEnemyInitiative: settings.hideEnemyInitiative },
    );
    const health = readHealth(combatant, context.healthSource ?? DEFAULT_HEALTH_SOURCE);
    const hp = hpView(health, {
      isGM,
      isOwner,
      disposition,
      hpForPlayers: settings.hpForPlayers,
    });
    const defeated = Boolean(combatant.isDefeated ?? combatant.defeated);
    const hidden = Boolean(combatant.hidden);
    const tokenHidden = Boolean(token?.hidden);
    const invisible = Boolean(combatant.actor?.statuses?.has?.("invisible"));
    const dead = isDeadForViewer({ defeated }, hp);
    const players = Array.from(combatant.players ?? []);
    const hasPlayerOwner = Boolean(combatant.hasPlayerOwner);
    // #14: an enemy is a placeholder until its first turn; the turn order stays Foundry's to show.
    const identityHidden = isIdentityHidden(
      {
        revealed: Boolean(combatant.flags?.[MODULE_ID]?.[IDENTITY_REVEALED_FLAG]),
        acting: CombatantAdapter.#isActing(combatant.id, { defeated, health, hasPlayerOwner, virtual }, context.acting),
        disposition,
        isOwner,
        virtual,
      },
      { isGM, concealEnemyIdentity: settings.concealEnemyIdentity },
    );
    // #15: the table's look for its side (NPC or player character); a placeholder's hit points say nothing.
    const look = defeatedLook(
      { defeated, down: !identityHidden && isDownForViewer(hp) },
      settings.defeatedLook?.[defeatedGroupOf({ hasPlayerOwner })],
    );

    const vm = {
      id: combatant.id,
      virtual,
      name,
      img: portrait.src,
      imgPosition: portrait.position,
      // The token's own art, as the canvas and the core tracker show it (the Venaerys strip may use it, RF-82).
      tokenImg: CombatantAdapter.portraitFor(combatant, "token", context.isVideo, { revealActor }).src,
      // RF-121: the character's own art for the turn announcement, the token's when this user may not see it.
      artImg: CombatantAdapter.portraitFor(combatant, "actor", context.isVideo, { revealActor }).src,
      initials: initialsOf(name),
      initiative: initiativeHidden ? null : initiative,
      initiativeHidden,
      hasInitiative: initiative !== null,
      disposition,
      dispositionKey: DISPOSITION_KEYS[disposition] ?? "neutral",
      hidden,
      tokenHidden,
      invisible,
      concealed: isConcealed({ hidden, tokenHidden, invisible }, settings.concealment),
      defeated,
      dead,
      alive: !dead,
      defeatedShown: look.shown,
      defeatedSkull: look.skull,
      defeatedGrey: look.grey,
      isOwner,
      hasPlayerOwner,
      players: players.map((user) => user.name),
      // RF-123: whose announcement card this combatant's turn shows — the player whose character it is, or its first owner.
      cardUserId: CombatantAdapter.#cardUserOf(players, combatant.actor?.id),
      hp,
      hpTotal: isGM ? health : null,
      healthTone: hp.mode === "none" || hp.mode === "hidden" ? null : healthTone(hp.pct),
      effects: CombatantAdapter.#readEffects(combatant.actor, context.round),
      identityHidden: false,
    };
    return identityHidden ? unidentifiedViewModel(vm, context.unknownName) : vm;
  }

  /**
   * #14: whether the combatant's turn is up now, and is one it keeps. A dead
   * combatant the GM's client skips at once only passes through, so it is
   * judged by the same rule over the actual hit points (players only ever
   * learn the answer: it shows less, never more).
   */
  static #isActing(id, { defeated, health, hasPlayerOwner, virtual }, acting) {
    if (!acting?.ids?.has(id)) return false;
    return !shouldSkipTurn({ defeated, hpTotal: health, hasPlayerOwner, virtual }, acting.skipDead);
  }

  /**
   * Portrait source with fallbacks; videos fall back to the actor image.
   * RF-117: without `revealActor`, the character's own art ("actor", "flag")
   * gives way to the token — a disguised creature keeps its disguise — and a
   * video token gives way to the initials, never to that art.
   */
  static portraitFor(combatant, source = "token", isVideo = () => false, { revealActor = true } = {}) {
    const actor = combatant.actor ?? null;
    const actorImg = actor?.img ?? null;
    const tokenImg = combatant.token?.texture?.src ?? null;
    let src = null;
    let position = null;
    if (!revealActor) source = "token";

    if (source === "flag") {
      const flag = actor?.flags?.[MODULE_ID]?.portrait;
      if (typeof flag === "string") src = flag;
      else if (flag && typeof flag === "object") {
        src = flag.src ?? null;
        position = flag.position ?? null;
      }
    }
    if (!src) src = source === "actor" ? actorImg ?? tokenImg : tokenImg ?? actorImg;
    src ??= combatant.img ?? null;
    if (src && isVideo(src)) src = revealActor && actorImg && !isVideo(actorImg) ? actorImg : null;
    return { src, position: position ?? DEFAULT_IMAGE_POSITION };
  }

  static #cardUserOf(players, actorId) {
    const main = (actorId && players.find((user) => user.character?.id === actorId)) || players[0];
    return main?.id ?? null;
  }

  /**
   * Whether this user could see the character's art in Foundry already: a
   * Limited permission shows the actor's sheet with its image.
   */
  static #canSeeActor(combatant) {
    return (combatant.actor?.permission ?? 0) >= OWNERSHIP_LIMITED;
  }

  /** Temporary effects (status conditions included), deduplicated by name and icon. */
  static #readEffects(actor, round) {
    const seen = new Set();
    const effects = [];
    for (const effect of actor?.temporaryEffects ?? []) {
      const img = effect.img ?? effect.icon ?? null;
      const key = `${effect.name}|${img}`;
      if (seen.has(key)) continue;
      seen.add(key);
      effects.push({ name: effect.name, img, rounds: CombatantAdapter.#remainingRounds(effect, round) });
    }
    return effects;
  }

  static #remainingRounds(effect, round) {
    const { rounds, startRound } = effect.duration ?? {};
    if (!Number.isFinite(rounds) || rounds <= 0 || !Number.isFinite(startRound)) return null;
    return Math.max(startRound + rounds - round, 0);
  }
}
