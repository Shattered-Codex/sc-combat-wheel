import { HIDDEN_OPACITY, I18N_ROOT, PAST_OPACITY } from "../constants/module-constants.js";
import { trackPose } from "../helpers/track-geometry.js";
import { windowSlots } from "../helpers/wheel-geometry.js";

/**
 * Draws the M stable slices of the window (ARCHITECTURE §4). Slices are created
 * once per layout; every later update only touches transform, clip-path,
 * opacity, and the content of slices whose combatant changed. The wheel turns
 * them on a rotor; the card views (RF-90) move them along a track instead,
 * with the same slots and content.
 */
export default class WheelRenderer {
  /** The element the slots live in: the wheel's rotor or the card track. */
  #rotor = null;
  #slots = [];
  #layout = null;
  /** Someone other than the real turn is on the anchor (RF-21): set by the app, even when T alone cannot tell. */
  viewing = false;

  /**
   * @param {HTMLElement} container  the wheel part's root
   * @param {object} layout          from layoutFor()
   * @param {object} handlers        { onClick(id, event), onDoubleClick(id, event), onContextMenu(id, event), onHoverIn(id, event), onHoverOut(event), onRollOne(id) }
   */
  mount(container, layout, handlers) {
    this.#layout = layout;
    container.replaceChildren();

    if (layout.view === "wheel") {
      const clip = document.createElement("div");
      clip.className = "scw-clip";
      this.#rotor = document.createElement("div");
      this.#rotor.className = "scw-rotor";
      clip.append(this.#rotor);
      container.append(clip);
    } else {
      this.#rotor = document.createElement("div");
      this.#rotor.className = "scw-track";
      // The slider's side cards turn away from the acting one, seen from in front of it.
      this.#rotor.style.perspectiveOrigin = `${layout.focus.x.toFixed(1)}px ${layout.focus.y.toFixed(1)}px`;
      container.append(this.#rotor);
    }

    this.#slots = Array.from({ length: layout.M }, (_, index) => this.#createSlot(index, handlers));
    this.#rotor.append(...this.#slots.map((slot) => slot.element));
  }

  get mounted() {
    return this.#rotor !== null && this.#rotor.isConnected;
  }

  /** Lays the window out for absolute turn T. `duration` is the step length in ms; 0 means instant. */
  apply(model, T, { duration = 0 } = {}) {
    if (!this.mounted) return;
    this.#rotor.style.setProperty("--scw-step-duration", `${Math.round(duration)}ms`);
    const slots = windowSlots({ T, N: model?.N ?? 0, layout: this.#layout });
    const turnRound = WheelRenderer.#turnRound(model, T);
    const peeking = Boolean(model?.N) && (this.viewing || T !== model.T);
    for (const slot of slots) {
      const vm = slot.combatantIndex === null ? null : model.ring[slot.combatantIndex];
      this.#applySlot(this.#slots[slot.index], slot, vm, {
        instant: duration === 0,
        showRound: Boolean(vm?.hasInitiative) && slot.round !== turnRound,
        // While viewing someone else the anchor is highlighted and the real turn gets a badge.
        highlight: peeking || !model?.activeHidden,
        // Hidden from this player, the real turn is nobody on the wheel: no badge.
        isRealTurn: peeking && !model.activeHidden && slot.s === model.T,
        // Before the start nobody has acted, whoever the anchor rests on.
        past: slot.past && Boolean(model?.started),
      });
    }
  }

  setFaded(faded) {
    this.#rotor?.classList.toggle("is-faded", faded);
  }

  unmount() {
    this.#rotor = null;
    this.#slots = [];
  }

  /** The round the anchored turn belongs to, from T itself. */
  static #turnRound(model, T) {
    return model?.N ? Math.floor(T / model.N) + 1 : null;
  }

  #createSlot(index, handlers) {
    const element = document.createElement("div");
    element.className = "scw-slot";
    element.dataset.index = String(index);
    element.innerHTML = `
      <div class="scw-slot-bg"></div>
      <div class="scw-portrait">
        <span class="scw-initials"></span>
        <img class="scw-portrait-img" alt="" draggable="false" loading="lazy">
        <span class="scw-phase-face" aria-hidden="true"><i class="scw-phase-icon"></i><span class="scw-phase-name"></span></span>
        <span class="scw-health" aria-hidden="true"></span>
        <i class="scw-flag scw-flag-hidden fa-solid fa-eye-slash" aria-hidden="true"></i>
        <i class="scw-flag scw-flag-defeated fa-solid fa-skull" aria-hidden="true"></i>
        <i class="scw-flag scw-flag-virtual fa-solid fa-bolt" aria-hidden="true"></i>
        <button type="button" class="scw-flag scw-flag-unrolled" tabindex="-1">
          <i class="fa-solid fa-dice-d20" aria-hidden="true"></i>
        </button>
        <span class="scw-badge-round"></span>
        <span class="scw-badge-turn" hidden></span>
        <span class="scw-name-tag" aria-hidden="true"></span>
        <span class="scw-badge-init" aria-hidden="true"></span>
      </div>
      <div class="scw-rim"></div>`;

    const slot = {
      element,
      initials: element.querySelector(".scw-initials"),
      img: element.querySelector(".scw-portrait-img"),
      portrait: element.querySelector(".scw-portrait"),
      rim: element.querySelector(".scw-rim"),
      roll: element.querySelector(".scw-flag-unrolled"),
      badge: element.querySelector(".scw-badge-round"),
      phaseIcon: element.querySelector(".scw-phase-icon"),
      phaseName: element.querySelector(".scw-phase-name"),
      turnBadge: element.querySelector(".scw-badge-turn"),
      nameTag: element.querySelector(".scw-name-tag"),
      initiative: element.querySelector(".scw-badge-init"),
      s: null,
      signature: "",
      combatantId: null,
      active: null,
    };
    slot.img.addEventListener("error", () => slot.img.classList.add("is-broken"));
    element.addEventListener("click", (event) => {
      if (!slot.combatantId) return;
      if (event.target.closest(".scw-flag-unrolled")) handlers.onRollOne(slot.combatantId);
      else handlers.onClick(slot.combatantId, event);
    });
    // The single click has already run twice by then, as in the core tracker.
    element.addEventListener("dblclick", (event) => {
      if (!slot.combatantId || event.target.closest(".scw-flag-unrolled")) return;
      handlers.onDoubleClick(slot.combatantId, event);
    });
    element.addEventListener("contextmenu", (event) => {
      if (slot.combatantId) handlers.onContextMenu(slot.combatantId, event);
    });
    element.addEventListener("keydown", (event) => {
      if (!slot.combatantId || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      handlers.onClick(slot.combatantId, event);
    });
    element.addEventListener("pointerenter", (event) => slot.combatantId && handlers.onHoverIn(slot.combatantId, event));
    element.addEventListener("pointerleave", (event) => handlers.onHoverOut(event));
    return slot;
  }

  #applySlot(slot, geometry, vm, { instant, showRound, highlight, isRealTurn, past }) {
    const { element } = slot;
    // A recycled slot jumps from one hidden edge to the other: never animate that.
    const recycled = slot.s !== null && slot.s !== geometry.s;
    element.classList.toggle("is-instant", instant || recycled);
    slot.s = geometry.s;

    const active = geometry.active && highlight && vm !== null;
    const wheel = this.#layout.view === "wheel";
    if (wheel) this.#poseSlice(slot, geometry, active);
    else this.#poseCard(slot, geometry);
    const visible = geometry.visible && vm !== null;
    // Cards overlap, so a see-through past card would show the one behind it: they dim with a veil instead.
    let opacity = 0;
    if (visible) opacity = past && wheel ? PAST_OPACITY : 1;
    if (visible && vm.concealed) opacity *= HIDDEN_OPACITY;
    element.style.opacity = String(opacity);
    element.classList.toggle("is-past", visible && past);
    element.classList.toggle("is-visible", visible);
    element.classList.toggle("is-active", active);
    element.classList.toggle("is-next-up", Boolean(visible && vm?.isOwner && geometry.k === 1 && !game.user.isGM));
    element.toggleAttribute("inert", !visible);
    element.tabIndex = visible ? 0 : -1;

    slot.combatantId = vm?.id ?? null;
    this.#applyContent(slot, vm, showRound ? geometry.round : null);
    const turnBadge = visible && isRealTurn;
    if (slot.turnBadge.hidden === turnBadge) {
      slot.turnBadge.hidden = !turnBadge;
      slot.turnBadge.textContent = turnBadge ? game.i18n.localize(`${I18N_ROOT}.Slice.TurnBadge`) : "";
    }
  }

  /** The wheel: the slice turns to its angle; the acting one grows past the rim. */
  #poseSlice(slot, geometry, active) {
    const { element } = slot;
    if (slot.active !== active) {
      slot.active = active;
      const layout = this.#layout;
      element.style.clipPath = active ? layout.activeSector : layout.sector;
      const rim = active ? layout.activeRim : layout.rim;
      Object.assign(slot.rim.style, {
        left: `${rim.left.toFixed(1)}px`,
        top: `${rim.top.toFixed(1)}px`,
        width: `${rim.width.toFixed(1)}px`,
        height: `${rim.height.toFixed(1)}px`,
        borderRadius: rim.radius,
      });
      const box = active ? layout.activePortrait : layout.portrait;
      Object.assign(slot.portrait.style, {
        left: `${box.left.toFixed(1)}px`,
        top: `${box.top.toFixed(1)}px`,
        width: `${box.size.toFixed(1)}px`,
        height: `${box.size.toFixed(1)}px`,
      });
    }
    element.style.transform = `rotate(${geometry.angle}deg)`;
  }

  /** A card view: the card slides to the pose of its window position; nearer the turn stacks higher. */
  #poseCard(slot, geometry) {
    const pose = trackPose(this.#layout, geometry.position);
    slot.element.style.transform = pose.transform;
    slot.element.style.zIndex = String(pose.z);
  }

  /** Only rewrites the slice's content when what it shows actually changed. */
  #applyContent(slot, vm, round) {
    const signature = vm
      ? [vm.id, vm.name, vm.img, vm.imgPosition, vm.initiative, vm.dispositionKey, vm.concealed, vm.dead, vm.isOwner, vm.virtual, round, vm.hp.text ?? vm.hp.stateKey ?? "", vm.healthTone, vm.hp.pct, vm.icon, vm.color, vm.finishedCount, vm.memberCount].join("|")
      : "";
    if (signature === slot.signature) return;
    slot.signature = signature;

    const { element } = slot;
    for (const key of ["friendly", "neutral", "hostile", "secret"]) {
      element.classList.toggle(`is-${key}`, vm?.dispositionKey === key);
    }
    element.classList.toggle("is-hidden", Boolean(vm?.concealed));
    element.classList.toggle("is-defeated", Boolean(vm?.dead));
    element.classList.toggle("is-unrolled", Boolean(vm && !vm.hasInitiative && !vm.virtual));
    element.classList.toggle("is-virtual", Boolean(vm?.virtual));
    this.#applyPhase(slot, vm);
    // RF-48: the health overlay only ever shows what hpView lets this viewer know.
    const tone = vm && !vm.virtual ? vm.healthTone : null;
    for (const name of ["good", "warn", "danger"]) element.classList.toggle(`is-health-${name}`, tone === name);
    // On the slice, not the portrait: the wheel's arc gauge is drawn by the rim, a sibling of the portrait.
    if (tone) element.style.setProperty("--scw-health", String(vm.hp.pct));
    else element.style.removeProperty("--scw-health");
    slot.roll.disabled = !vm?.isOwner;
    slot.roll.setAttribute("aria-label", game.i18n.localize(`${I18N_ROOT}.Slice.RollOne`));

    slot.initials.textContent = vm?.initials ?? "";
    // Shown by the card views only (RF-90); the name is already what this viewer may see.
    slot.nameTag.textContent = vm?.name ?? "";
    // RF-94: the initiative the core tracker already shows; nothing for phases or before a roll.
    const initiative = vm?.kind === "phase" ? null : vm?.initiative ?? null;
    slot.initiative.textContent = initiative === null ? "" : String(initiative);
    slot.initiative.hidden = initiative === null;
    if (vm?.img) {
      if (slot.img.getAttribute("src") !== vm.img) {
        slot.img.classList.remove("is-broken");
        slot.img.src = vm.img;
      }
      slot.img.style.objectPosition = vm.imgPosition;
      slot.img.hidden = false;
    } else {
      slot.img.removeAttribute("src");
      slot.img.hidden = true;
    }
    slot.badge.textContent = round ? `R${round}` : "";
    slot.badge.hidden = !round;

    if (vm) {
      // A phase is read, not pressed: it has no token to pan to.
      element.setAttribute("role", vm.kind === "phase" ? "img" : "button");
      element.setAttribute("aria-label", vm.name);
      // On the portrait, not the slice: the slice's box is the whole rotated wheel square.
      slot.portrait.dataset.tooltip = WheelRenderer.#tooltip(vm);
    } else {
      element.removeAttribute("role");
      element.removeAttribute("aria-label");
      delete slot.portrait.dataset.tooltip;
    }
  }

  /** RF-80: a Venaerys phase shows its icon and name on its own color instead of a portrait. */
  #applyPhase(slot, vm) {
    const phase = vm?.kind === "phase";
    slot.element.classList.toggle("is-phase", phase);
    slot.element.classList.toggle("is-waiting", Boolean(phase && vm.waiting));
    slot.phaseIcon.className = phase ? `scw-phase-icon ${vm.icon}` : "scw-phase-icon";
    slot.phaseName.textContent = phase ? vm.name : "";
    if (phase && vm.color) slot.element.style.setProperty("--scw-phase-color", vm.color);
    else slot.element.style.removeProperty("--scw-phase-color");
  }

  static #tooltip(vm) {
    const i18n = (key, data) => game.i18n.format(`${I18N_ROOT}.${key}`, data);
    if (vm.kind === "phase") {
      const parts = [vm.name];
      if (vm.memberCount) parts.push(i18n("Phase.Progress", { done: vm.finishedCount, total: vm.memberCount }));
      return foundry.utils.escapeHTML(parts.join(" · "));
    }
    const parts = [vm.name, i18n("Tooltip.Initiative", { value: vm.initiative ?? "—" })];
    if (vm.hp.mode === "number") parts.push(i18n("Tooltip.Hp", { value: vm.hp.text }));
    else if (vm.hp.stateKey) parts.push(game.i18n.localize(`${I18N_ROOT}.HealthState.${vm.hp.stateKey}`));
    parts.push(game.i18n.localize(vm.virtual ? `${I18N_ROOT}.Slice.Virtual` : `${I18N_ROOT}.Disposition.${vm.dispositionKey}`));
    if (vm.dead) parts.push(game.i18n.localize(`${I18N_ROOT}.Slice.Defeated`));
    if (vm.concealed) parts.push(game.i18n.localize(`${I18N_ROOT}.Slice.Hidden`));
    // data-tooltip is read as HTML, and names come from players.
    return foundry.utils.escapeHTML(parts.join(" · "));
  }
}
