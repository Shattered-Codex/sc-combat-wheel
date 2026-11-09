import { I18N_ROOT, SETTINGS } from "../constants/module-constants.js";
import { activeTheme, appearanceValues, getSetting } from "../hooks/register-settings.js";
import { FX_BOOST, INTENSITY_AMOUNTS, PARTICLE_INTENSITIES } from "../helpers/particle-presets.js";
import { announceModeFor, announcementFor, nextUpFor } from "../helpers/turn-announcement.js";
import { withCard } from "../helpers/announce-card.js";
import AnnouncementCards from "./AnnouncementCards.js";
import WheelAppearance from "../applications/WheelAppearance.js";
import WheelFxLayer from "../applications/WheelFxLayer.js";
import WheelParticles from "../applications/WheelParticles.js";

const t = (key) => game.i18n.localize(`${I18N_ROOT}.${key}`);
const f = (key, data) => game.i18n.format(`${I18N_ROOT}.${key}`, data);

const FADE_MS = 400;
/** Portrait sizes in px; a phase of many shrinks them so the row still fits. */
const PORTRAIT_SIZES = Object.freeze({ small: 76, normal: 110, large: 150 });
const MINOR_SCALE = 0.6;
/** "You are up next" on its own is shorter than a turn. */
const MINOR_SECONDS = 2.5;
const SIDES = new Set(["friendly", "neutral", "hostile", "secret"]);
/** A "tall" portrait is this wide for its height (announce.css draws the same). */
const TALL_RATIO = 0.75;

/**
 * RF-121: the turn announcement — "Your turn!", whose turn it is, or under SC
 * Venaerys's Initiative the phase with all its members — with the look's
 * effect and particles around each portrait. Each client draws its own after
 * a real turn change (TurnSideEffects), wheel open or not; nothing goes over
 * the network. One at a time: a new turn replaces it, a click on it dismisses
 * it — and still reaches the token or the canvas under it, so the GM is never
 * held up by the card after advancing the turn.
 */
export default class TurnAnnouncer {
  /** What is on screen: the card, its effect layers, the timer, its combat, its click watcher, and the editor's backdrop if any. */
  static #current = null;
  static #host = null;

  /**
   * After a real turn change. Returns whether it told this user they are up
   * next, so the plain notification is not shown as well. A turn with nothing
   * to say still takes the last announcement down: "Your turn!" must not
   * outlive the turn.
   */
  static onTurnChanged(model, look = appearanceValues()) {
    const isGM = game.user.isGM;
    if (announceModeFor(look[SETTINGS.announceMode], isGM) === "off") return false;
    const mode = look[SETTINGS.announceMode];
    const cardLook = TurnAnnouncer.#cardLookFor(model, look);
    const turn = announcementFor(model, { isGM, mode, image: cardLook[SETTINGS.announceImage] });
    const next = look[SETTINGS.announceNextUp] && getSetting(SETTINGS.nextUpNotice) ? nextUpFor(model, { isGM, image: look[SETTINGS.announceImage] }) : null;
    const combatId = model?.combatId ?? null;
    if (turn) TurnAnnouncer.show(turn, cardLook, { nextUp: Boolean(next), combatId });
    else if (next) TurnAnnouncer.show(next, look, { minor: true, combatId });
    else TurnAnnouncer.dismiss();
    return Boolean(next);
  }

  /**
   * RF-123: on another player's character's turn, the card that player shares
   * over this user's look — unless this user keeps their own for everyone. A
   * phase has many owners, so it is always drawn with this user's look.
   */
  static #cardLookFor(model, look) {
    const userId = model?.phased ? null : model?.current?.cardUserId;
    if (!userId || userId === game.user.id || !look[SETTINGS.announcePlayerCards]) return look;
    return withCard(look, AnnouncementCards.cardOf(userId));
  }

  /**
   * @param {object} announcement  from announcementFor() / nextUpFor()
   * @param {object} [look]        appearance values (the editor passes its draft)
   * @param {object} [options]
   * @param {boolean} [options.minor]    "you are up next" on its own: smaller and shorter
   * @param {boolean} [options.nextUp]   adds "you are up next" under someone else's turn
   * @param {boolean} [options.preview]  the editor's test: over a darkened screen, above every window
   * @param {string}  [options.combatId] the combat it is about, so its deletion takes it down
   */
  static show(announcement, look = appearanceValues(), { minor = false, nextUp = false, preview = false, combatId = null } = {}) {
    TurnAnnouncer.dismiss({ instant: true });
    const seconds = minor ? Math.min(MINOR_SECONDS, look[SETTINGS.announceSeconds]) : look[SETTINGS.announceSeconds];
    const backdrop = preview ? TurnAnnouncer.#backdrop() : null;
    const host = backdrop ? backdrop.firstElementChild : TurnAnnouncer.#prepareHost();
    TurnAnnouncer.#applyLook(host, look);

    const card = TurnAnnouncer.#card(announcement, look, { minor, nextUp, preview });
    host.append(card);
    const layers = TurnAnnouncer.#decorate(card, announcement, look, minor);
    requestAnimationFrame(() => {
      card.classList.add("is-shown");
      backdrop?.classList.add("is-shown");
    });
    // The editor's test closes on a click on its backdrop; in play the card takes no pointer, so a press on it is watched for instead.
    backdrop?.addEventListener("click", () => TurnAnnouncer.dismiss());
    const onPointerDown = backdrop ? null : (event) => TurnAnnouncer.#isOver(card, event) && TurnAnnouncer.dismiss();
    if (onPointerDown) document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    const timer = setTimeout(() => TurnAnnouncer.dismiss(), seconds * 1000);
    TurnAnnouncer.#current = { card, layers, timer, backdrop, combatId, onPointerDown };
  }

  /** The combat is gone (deleted, or ended): what was said about it goes too. */
  static dismissCombat(combatId) {
    if (combatId && TurnAnnouncer.#current?.combatId === combatId) TurnAnnouncer.dismiss();
  }

  static #isOver(card, { clientX, clientY }) {
    const box = card.getBoundingClientRect();
    return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
  }

  /**
   * The announcement drawn inside `container` — the appearance editor's live
   * preview — already shown: no timer, no click, no entrance, no backdrop.
   * Returns what clears it.
   */
  static mount(container, announcement, look) {
    const host = document.createElement("div");
    host.className = "sc-combat-wheel scw-announce-host scw-announce-host--inline";
    TurnAnnouncer.#applyLook(host, look);
    const card = TurnAnnouncer.#card(announcement, look, { minor: false, nextUp: false, preview: true });
    card.classList.add("is-shown");
    host.append(card);
    container.append(host);
    const layers = TurnAnnouncer.#decorate(card, announcement, look, false);
    return () => {
      for (const layer of layers) layer.destroy();
      host.remove();
    };
  }

  /** Fades the announcement out (or drops it at once, when another takes its place). */
  static dismiss({ instant = false } = {}) {
    const current = TurnAnnouncer.#current;
    if (!current) return;
    TurnAnnouncer.#current = null;
    clearTimeout(current.timer);
    if (current.onPointerDown) document.removeEventListener("pointerdown", current.onPointerDown, { capture: true });
    current.card.classList.remove("is-shown");
    current.backdrop?.classList.remove("is-shown");
    const remove = () => {
      for (const layer of current.layers) layer.destroy();
      current.card.remove();
      current.backdrop?.remove();
    };
    if (instant) remove();
    else setTimeout(remove, FADE_MS);
  }

  /**
   * The title and the line under it, as this user reads the announcement. The
   * GM's own turns (their NPCs') read as anyone's; the editor's test shows a
   * player's own turn, since the GM's look is often the table's.
   */
  static #texts(announcement, look, { minor, nextUp, preview }) {
    const own = announcement.own && (preview || !game.user.isGM);
    const custom = String(look[SETTINGS.announceTitle] ?? "").trim();
    if (minor) return { title: t("Announce.NextUp"), sub: announcement.name, footer: "" };
    const footer = nextUp ? t("Announce.NextUpLine") : "";
    if (announcement.kind === "phase") {
      const half = announcement.phase.half ? t(`Phase.Half.${announcement.phase.half}`) : t("Announce.PhaseNow");
      if (own) return { title: custom || t("Announce.YourPhase"), sub: `${announcement.phase.name} · ${half}`, footer };
      return { title: announcement.phase.name, sub: half, footer };
    }
    if (own) return { title: custom || t("Announce.YourTurn"), sub: announcement.name, footer };
    return { title: f("Announce.TurnOf", { name: announcement.name }), sub: "", footer };
  }

  /** An actor's colour: their side's, the theme's accent, or the user's own. */
  static #colorOf(dispositionKey, look) {
    const mode = look[SETTINGS.announceColor];
    if (mode === "custom") return look[SETTINGS.announceCustomColor] || "var(--scw-accent)";
    if (mode === "side" && SIDES.has(dispositionKey)) return `var(--scw-${dispositionKey})`;
    return "var(--scw-accent)";
  }

  static #portraitSize(announcement, look, minor) {
    const base = PORTRAIT_SIZES[look[SETTINGS.announceSize]] ?? PORTRAIT_SIZES.normal;
    const count = announcement.actors.length;
    const crowd = count > 4 ? 0.7 : count > 2 ? 0.85 : 1;
    return Math.round(base * crowd * (minor ? MINOR_SCALE : 1));
  }

  static #card(announcement, look, { minor, nextUp, preview }) {
    const { title, sub, footer } = TurnAnnouncer.#texts(announcement, look, { minor, nextUp, preview });
    const phaseColor = announcement.kind === "phase" && look[SETTINGS.announceColor] === "side" ? announcement.phase.color : null;
    const card = document.createElement("div");
    card.className = `scw-announce is-${announcement.kind}`;
    card.classList.toggle("is-own", Boolean(announcement.own));
    card.classList.toggle("is-minor", minor);
    card.setAttribute("role", "status");
    card.style.setProperty("--scw-announce-c", phaseColor || TurnAnnouncer.#colorOf(announcement.actors[0]?.dispositionKey, look));
    const size = TurnAnnouncer.#portraitSize(announcement, look, minor);
    card.style.setProperty("--scw-announce-size", `${size}px`);
    // Room for the effect around each portrait, so rings and flames keep off the neighbours and the names.
    const boost = FX_BOOST[look[SETTINGS.announceIntensity]] ?? FX_BOOST.normal;
    const reach = announcement.portraits ? Math.round(WheelAppearance.effectReach(look[SETTINGS.announceEffect]) * boost * size) : 0;
    card.style.setProperty("--scw-announce-reach", `${reach}px`);

    // With no picture a turn's card is its words alone; a phase still names its members.
    const named = announcement.kind === "phase";
    if (announcement.actors.length && (announcement.portraits || named)) {
      const cast = document.createElement("div");
      cast.className = "scw-announce-cast";
      for (const actor of announcement.actors) cast.append(TurnAnnouncer.#actor(actor, look, { named, portrait: announcement.portraits }));
      card.append(cast);
    }
    const text = document.createElement("div");
    text.className = "scw-announce-text";
    const heading = document.createElement("span");
    heading.className = "scw-announce-title";
    if (announcement.phase?.icon && !minor) {
      const icon = document.createElement("i");
      icon.className = `${announcement.phase.icon} scw-announce-icon`;
      icon.setAttribute("aria-hidden", "true");
      heading.append(icon);
    }
    heading.append(title);
    text.append(heading);
    for (const [line, className] of [[sub, "scw-announce-sub"], [footer, "scw-announce-footer"]]) {
      if (!line) continue;
      const span = document.createElement("span");
      span.className = className;
      span.textContent = line;
      text.append(span);
    }
    card.append(text);
    return card;
  }

  /**
   * One member of the cast: their portrait (the picture, or their initials
   * when it is missing) with the zero-size anchor at its centre that the
   * effect and particles hang from, and their name under it when asked. The
   * look's "no picture" leaves the portrait out altogether, so nothing is
   * drawn around it either.
   */
  static #actor(actor, look, { named, portrait: withPortrait }) {
    const figure = document.createElement("figure");
    figure.className = `scw-announce-actor is-${actor.dispositionKey}`;
    figure.classList.toggle("is-dimmed", Boolean(actor.dimmed));
    figure.style.setProperty("--scw-fx-c", TurnAnnouncer.#colorOf(actor.dispositionKey, look));
    if (withPortrait) figure.append(TurnAnnouncer.#portrait(actor));
    if (named) {
      const caption = document.createElement("figcaption");
      caption.className = "scw-announce-name";
      caption.textContent = actor.name;
      figure.append(caption);
    }
    return figure;
  }

  static #portrait(actor) {
    const portrait = document.createElement("span");
    portrait.className = "scw-announce-portrait";
    const anchor = document.createElement("span");
    anchor.className = "scw-announce-anchor";
    portrait.append(anchor);
    if (actor.img) {
      const img = document.createElement("img");
      img.className = "scw-announce-img";
      img.src = actor.img;
      img.alt = "";
      portrait.append(img);
    } else {
      const initials = document.createElement("span");
      initials.className = "scw-announce-initials";
      initials.textContent = actor.initials || actor.name.slice(0, 2);
      portrait.append(initials);
    }
    return portrait;
  }

  /** The look's effect and particles around every portrait still in play; a finished one stays plain. */
  static #decorate(card, announcement, look, minor) {
    const intensity = look[SETTINGS.announceIntensity];
    const scale = FX_BOOST[intensity] ?? FX_BOOST.normal;
    const size = TurnAnnouncer.#portraitSize(announcement, look, minor);
    const layers = [];
    const anchors = card.querySelectorAll(".scw-announce-actor:not(.is-dimmed) .scw-announce-anchor");
    // The effect follows the portrait's outline: a circle, or a card for the square, tall and free ones.
    const frame = look[SETTINGS.announceFrame] ?? "round";
    const shape = frame === "round" ? "round" : "card";
    const width = frame === "tall" ? Math.round(size * TALL_RATIO) : size;
    for (const anchor of anchors) {
      const box = { x: 0, y: 0, width, height: size };
      const fx = new WheelFxLayer("acting");
      fx.update(anchor, { box, shape, effect: look[SETTINGS.announceEffect] ?? "none", scale });
      const particles = new WheelParticles();
      particles.update(anchor, {
        type: look[SETTINGS.announceParticles],
        amount: INTENSITY_AMOUNTS[intensity] ?? "normal",
        scale,
        speed: look[SETTINGS.particleSpeed],
        intensity,
        box: { ...box, width: size * 1.2, height: size * 1.2 },
        color: anchor.closest(".scw-announce-actor").style.getPropertyValue("--scw-fx-c"),
      });
      layers.push(fx, particles);
    }
    return layers;
  }

  static #prepareHost() {
    if (!TurnAnnouncer.#host?.isConnected) {
      TurnAnnouncer.#host = document.createElement("div");
      TurnAnnouncer.#host.className = "sc-combat-wheel scw-announce-host";
      document.body.append(TurnAnnouncer.#host);
    }
    return TurnAnnouncer.#host;
  }

  /** The editor's test: a host of its own in a backdrop over everything, gone with the announcement. */
  static #backdrop() {
    const backdrop = document.createElement("div");
    backdrop.className = "scw-announce-backdrop";
    const host = document.createElement("div");
    host.className = "sc-combat-wheel scw-announce-host";
    backdrop.append(host);
    document.body.append(backdrop);
    return backdrop;
  }

  static #applyLook(host, look) {
    // The wheel's theme and colours; the announcement's own intensity.
    WheelAppearance.applyLook(host, look, { orientation: "up", theme: activeTheme(look), expanded: false });
    const intensity = look[SETTINGS.announceIntensity];
    host.style.setProperty("--scw-fx-strength", String(PARTICLE_INTENSITIES[intensity] ?? PARTICLE_INTENSITIES.normal));
    host.style.setProperty("--scw-fx-boost", String(FX_BOOST[intensity] ?? FX_BOOST.normal));
    host.dataset.scwAnnounceStyle = look[SETTINGS.announceStyle] ?? "card";
    host.dataset.scwAnnouncePosition = look[SETTINGS.announcePosition] ?? "center";
    host.dataset.scwAnnounceSize = look[SETTINGS.announceSize] ?? "normal";
    host.dataset.scwAnnounceFrame = look[SETTINGS.announceFrame] ?? "round";
    host.dataset.scwAnnounceBorder = look[SETTINGS.announceBorder] ?? "color";
    host.dataset.scwAnnounceEntrance = look[SETTINGS.announceEntrance] ?? "zoom";
  }
}
