import { HIDDEN_OPACITY, I18N_ROOT, PAST_OPACITY } from "../constants/module-constants.js";
import { DEFAULT_VIRTUAL_IMAGE } from "../helpers/virtual-positions.js";
import { landingSlot, lastReachableSlot } from "../helpers/initiative-order.js";
import { OVERVIEW_GRID, gridClip, gridLayout, shortestOffset } from "../helpers/wheel-geometry.js";
import { wheelRotation } from "../helpers/orientation.js";
import { cardClip, trackPose } from "../helpers/track-geometry.js";

const EASE = "cubic-bezier(.3,.1,.15,1)";
const MOVE_MS = 650;
const OPEN_STAGGER_MS = 22;
const RETURN_STAGGER_MS = 12;
const RETURN_TOTAL_MS = 900;
const MARGIN = 48;
const HEADER = 96;
const DRAG_THRESHOLD = 6;

/**
 * "See everyone" (RF-20, RF-21, RF-33, RF-69): a full-screen layer over a dark
 * backdrop. The slices fly out of the wheel and float in combat order, with no
 * panel around them; picking one flies them back with it on the anchor.
 * The GM can also drag a portrait to a new place in the order, insert a virtual
 * position between two others, or remove one. Tiles only animate transform,
 * clip-path and opacity (SPEC §4); nothing here writes documents itself — it
 * hands the GM's intent to the callbacks.
 */
export default class OverviewLayer {
  #root = null;
  #tiles = [];
  #inserts = [];
  #phase = "closed";
  #timers = [];
  #context = null;
  #popover = null;
  /** Where the open "+" form inserts: its neighbours by id, and their gap's index in the ring shown. */
  #popoverPlace = null;
  /** A ring that changed before the first frame: laid out once the overview is open. */
  #pendingModel = null;

  get isOpen() {
    return this.#phase !== "closed";
  }

  /**
   * @param {object} options
   * @param {object} options.model        WheelModel
   * @param {object} options.layout       layoutFor()
   * @param {"up"|"right"|"down"|"left"} options.orientation
   * @param {{x:number,y:number}} options.anchor  wheel anchor on screen
   * @param {number} options.scale        widget scale
   * @param {string} options.theme        data-scw-theme of the wheel
   * @param {number} options.viewIndex    ring index on the anchor
   * @param {number} options.viewT        absolute turn on the anchor
   * @param {() => object[]} options.templates  virtual position templates (GM), read when the form opens
   * @param {() => void} [options.onManageVirtual]  opens the virtual positions' settings (GM)
   * @param {(combatantId: string|null, pickedOn: object) => void} options.onClosed  the picked combatant (or null) and the model it was picked on
   * @param {(combatantId: string, slot: number) => void} [options.onMove]      GM drag
   * @param {(slot: number, data: object) => void} [options.onInsert]         GM "+"
   * @param {(combatantId: string) => void} [options.onRemove]                 GM ×
   * @param {(combatantId: string, event: MouseEvent) => void} [options.onContextMenu]  right click (or the menu key) on a tile
   */
  open(options) {
    if (this.isOpen || !options.model?.N) return;
    this.#context = { ...options, base: wheelRotation(options.orientation) };
    this.#context.grid = OverviewLayer.#placeGrid(options.model.N);
    this.#build();

    this.#phase = "start";
    this.#tiles.forEach((tile, j) => this.#poseOnWheel(tile, j, options.viewIndex, { transition: false }));
    void this.#root.offsetWidth;
    requestAnimationFrame(() => {
      if (this.#phase !== "start") return;
      this.#phase = "open";
      this.#root.classList.add("is-open");
      const pending = this.#pendingModel;
      this.#pendingModel = null;
      // Changed meanwhile: the tiles are rebuilt straight on the grid, without the flight.
      if (pending) this.refresh(pending);
      else this.#tiles.forEach((tile, j) => this.#poseOnGrid(tile, j, { delay: j * OPEN_STAGGER_MS }));
      this.#tiles[this.#context.viewIndex]?.element.focus({ preventScroll: true });
    });
  }

  /** Re-lays the open overview for a changed ring (a move, an insert, the turn, a portrait), without flying. */
  refresh(model) {
    // Before the first frame the change waits for it; while flying back the overview is on its way out.
    if (this.#phase === "start") this.#pendingModel = model;
    if (this.#phase !== "open") return;
    this.#context.model = model;
    this.#setTitle(model);
    this.#context.viewIndex = Math.min(this.#context.viewIndex, model.N - 1);
    this.#context.grid = OverviewLayer.#placeGrid(model.N);
    // The tiles are rebuilt: keyboard focus follows the same combatant.
    const focusedId = this.#tiles.find((tile) => tile.element === document.activeElement)?.id;
    for (const node of [...this.#tiles.flatMap((t) => [t.element, t.label]), ...this.#inserts]) node.remove();
    this.#buildTiles();
    this.#tiles.forEach((tile, j) => this.#poseOnGrid(tile, j, { delay: 0, transition: false }));
    if (focusedId) this.#tiles.find((tile) => tile.id === focusedId)?.element.focus({ preventScroll: true });
    this.#keepPopover(model);
  }

  /**
   * A "+" form being filled survives a refresh (another GM's turn change, a
   * portrait update) while its two neighbours still sit side by side; once
   * they do not, the place it named is gone and the form closes.
   */
  #keepPopover(model) {
    if (!this.#popover) return;
    const { beforeId, afterId } = this.#popoverPlace;
    const slot = beforeId === null ? 0 : model.ring.findIndex((vm) => vm.id === beforeId) + 1;
    if (slot === 0 && beforeId !== null) return this.#closePopover();
    if ((model.ring[slot]?.id ?? null) !== afterId) return this.#closePopover();
    this.#popoverPlace.slot = slot;
    this.#inserts[slot]?.classList.add("is-target");
    OverviewLayer.#placePopover(this.#popover, this.#slotPoint(slot));
  }

  static #placePopover(form, point) {
    form.style.left = `${Math.min(Math.max(point.x, 170), window.innerWidth - 170)}px`;
    form.style.top = `${Math.min(point.y + 28, window.innerHeight - 260)}px`;
  }

  /**
   * Flies the tiles back around `index` (or the current view when null), then
   * closes, handing back the picked combatant's id: the ring may change during
   * the flight, and an index would then name someone else.
   */
  close(index = null) {
    if (this.#phase !== "open" && this.#phase !== "start") return;
    this.#closePopover();
    const { model, viewIndex, onClosed } = this.#context;
    const center = index ?? viewIndex;
    const pickedId = index === null ? null : model.ring[index]?.id ?? null;
    this.#phase = "return";
    this.#root.classList.remove("is-open");
    this.#tiles.forEach((tile, j) =>
      this.#poseOnWheel(tile, j, center, { transition: true, delay: (model.N - j) * RETURN_STAGGER_MS }),
    );
    this.#later(() => {
      this.destroy();
      onClosed(pickedId, model);
    }, RETURN_TOTAL_MS);
  }

  destroy() {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers = [];
    this.#root?.remove();
    this.#root = null;
    this.#tiles = [];
    this.#inserts = [];
    this.#popover = null;
    this.#popoverPlace = null;
    this.#pendingModel = null;
    this.#phase = "closed";
  }

  /* -------------------------------------------- */
  /*  Layout                                      */
  /* -------------------------------------------- */

  /** The acting tile, or none while a player's turn is on someone hidden from them. */
  static #turnIndex(model) {
    return model.activeHidden ? -1 : model.currentIndex;
  }

  /** Centres the grid on screen, under the floating header. */
  static #placeGrid(N) {
    const layout = gridLayout({
      N,
      maxWidth: window.innerWidth - 2 * MARGIN,
      maxHeight: window.innerHeight - HEADER - MARGIN,
      metrics: OVERVIEW_GRID,
    });
    const room = window.innerHeight - HEADER - MARGIN;
    return {
      ...layout,
      origin: {
        x: (window.innerWidth - layout.width) / 2,
        y: HEADER + Math.max(0, (room - layout.height) / 2),
      },
    };
  }

  #cellCenter(j) {
    const { grid } = this.#context;
    const cell = grid.cells[j];
    return { x: grid.origin.x + cell.x, y: grid.origin.y + cell.y };
  }

  /** Screen point of insertion slot k: just before cell k, or after the last one. */
  #slotPoint(k) {
    const { grid, model } = this.#context;
    if (k < model.N) {
      const center = this.#cellCenter(k);
      return { x: center.x - grid.cellWidth / 2, y: center.y };
    }
    const last = this.#cellCenter(model.N - 1);
    return { x: last.x + grid.cellWidth / 2, y: last.y };
  }

  /* -------------------------------------------- */
  /*  DOM                                         */
  /* -------------------------------------------- */

  #build() {
    const { model, theme } = this.#context;
    const i18n = (key, data = {}) => game.i18n.format(`${I18N_ROOT}.${key}`, data);
    this.#root = document.createElement("div");
    this.#root.className = "sc-combat-wheel scw-overview";
    this.#root.dataset.scwTheme = theme;
    this.#root.setAttribute("role", "dialog");
    this.#root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (this.#popover) this.#closePopover();
      else this.close();
    });

    const backdrop = document.createElement("div");
    backdrop.className = "scw-overview-backdrop";
    backdrop.addEventListener("click", () => (this.#popover ? this.#closePopover() : this.close()));

    const header = document.createElement("header");
    header.className = "scw-overview-header";
    header.innerHTML = `
      <span class="scw-overview-title"></span>
      <span class="scw-overview-hint"></span>
      <button type="button" class="scw-btn scw-btn--ghost scw-overview-close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
    header.querySelector(".scw-overview-hint").textContent = i18n(game.user.isGM ? "Grid.HintGM" : "Grid.Hint");
    const close = header.querySelector(".scw-overview-close");
    close.setAttribute("aria-label", i18n("Grid.Close"));
    close.addEventListener("click", () => this.close());

    this.#root.append(backdrop, header);
    this.#setTitle(model);
    this.#buildTiles();
    document.body.append(this.#root);
  }

  #setTitle(model) {
    const title = game.i18n.format(`${I18N_ROOT}.Grid.Title`, { round: Math.max(1, model.round) });
    this.#root.setAttribute("aria-label", title);
    this.#root.querySelector(".scw-overview-title").textContent = title;
  }

  #buildTiles() {
    const { model, onInsert } = this.#context;
    this.#tiles = model.ring.map((vm, j) => this.#buildTile(vm, j));
    this.#root.append(...this.#tiles.flatMap((tile) => [tile.element, tile.label]));
    this.#inserts = [];
    if (game.user.isGM && onInsert) {
      // Nothing can sort after those without initiative (Foundry keeps them last): no "+" among them.
      const reach = lastReachableSlot(OverviewLayer.#initiatives(model));
      for (let k = 0; k <= reach; k++) this.#inserts.push(this.#buildInsert(k, { beforeUnrolled: k === reach && reach < model.N }));
      this.#root.append(...this.#inserts);
    }
  }

  #buildTile(vm, j) {
    const { layout, anchor, grid, model, onRemove } = this.#context;
    const element = document.createElement("div");
    element.className = `scw-grid-tile is-${vm.dispositionKey}`;
    element.classList.toggle("is-turn", j === OverviewLayer.#turnIndex(model));
    element.classList.toggle("is-hidden", Boolean(vm.concealed));
    element.classList.toggle("is-defeated", Boolean(vm.dead));
    element.classList.toggle("is-virtual", Boolean(vm.virtual));
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", vm.name);
    Object.assign(element.style, {
      width: `${layout.S}px`,
      height: `${layout.S}px`,
      left: `${anchor.x - layout.Rm}px`,
      top: `${anchor.y - layout.Rm}px`,
    });
    element.innerHTML = `
      <div class="scw-slot-bg"></div>
      <div class="scw-portrait">
        <span class="scw-initials"></span>
        <img class="scw-portrait-img" alt="" draggable="false">
        <i class="scw-flag scw-flag-hidden fa-solid fa-eye-slash" aria-hidden="true"></i>
        <i class="scw-flag scw-flag-defeated fa-solid fa-skull" aria-hidden="true"></i>
      </div>
      <div class="scw-grid-rim"></div>`;
    element.querySelector(".scw-initials").textContent = vm.initials;
    const img = element.querySelector(".scw-portrait-img");
    if (vm.img) {
      img.src = vm.img;
      img.style.objectPosition = vm.imgPosition;
    } else img.hidden = true;

    // The portrait box sits at its grid size for good; the wheel pose is only a
    // transform of it, so the flight animates transform alone.
    const size = grid.tile;
    const box = OverviewLayer.#box({ left: layout.Rm - size / 2, top: layout.Rm - size / 2, width: size, height: size });
    Object.assign(element.querySelector(".scw-grid-rim").style, box);
    const portrait = element.querySelector(".scw-portrait");
    Object.assign(portrait.style, box);

    const tile = { element, portrait, hidden: Boolean(vm.concealed), id: vm.id, virtual: Boolean(vm.virtual) };
    this.#bindTile(tile, j);

    if (vm.virtual && game.user.isGM && onRemove) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "scw-overview-remove";
      remove.innerHTML = `<i class="fa-solid fa-xmark" aria-hidden="true"></i>`;
      remove.setAttribute("aria-label", game.i18n.localize(`${I18N_ROOT}.Grid.RemoveVirtual`));
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        onRemove(vm.id);
      });
      remove.addEventListener("pointerdown", (event) => event.stopPropagation());
      // Inside the square's corner: the tile's clip-path would hide anything outside it.
      remove.style.left = `${layout.Rm + size / 2 - 24}px`;
      remove.style.top = `${layout.Rm - size / 2 + 4}px`;
      element.append(remove);
    }

    const label = document.createElement("div");
    label.className = "scw-grid-label";
    label.classList.toggle("is-turn", j === OverviewLayer.#turnIndex(model));
    const center = this.#cellCenter(j);
    Object.assign(label.style, {
      left: `${center.x - grid.cellWidth / 2}px`,
      top: `${center.y + grid.tile / 2 + 6}px`,
      width: `${grid.cellWidth}px`,
      transitionDelay: `${250 + j * OPEN_STAGGER_MS}ms`,
    });
    label.innerHTML = `<span class="scw-grid-name"></span><span class="scw-grid-init"></span>`;
    label.firstElementChild.textContent = vm.name;
    label.lastElementChild.textContent = vm.initiative ?? "—";
    tile.label = label;
    return tile;
  }

  /** Click picks, Enter/Space picks, and for the GM a drag moves (RF-33). */
  #bindTile(tile, j) {
    const { element } = tile;
    element.addEventListener("contextmenu", (event) => {
      if (this.#phase !== "open" || !this.#context.onContextMenu) return;
      this.#closePopover();
      this.#context.onContextMenu(tile.id, event);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.close(j);
    });
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.#phase !== "open") return;
      const canDrag = game.user.isGM && Boolean(this.#context.onMove);
      const start = { x: event.clientX, y: event.clientY };
      let dragging = false;
      let slot = null;
      element.setPointerCapture(event.pointerId);

      const onMove = (move) => {
        const dx = move.clientX - start.x;
        const dy = move.clientY - start.y;
        if (!dragging && canDrag && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          dragging = true;
          element.classList.add("is-dragging");
          this.#root.classList.add("is-dragging");
          element.style.transition = "none";
        }
        if (!dragging) return;
        const center = this.#cellCenter(j);
        element.style.transform = `translate(${(center.x - this.#context.anchor.x + dx).toFixed(1)}px, ${(center.y - this.#context.anchor.y + dy).toFixed(1)}px) rotate(0deg) scale(1.06)`;
        // Where it would really land: never among those without initiative.
        slot = landingSlot(OverviewLayer.#initiatives(this.#context.model), this.#nearestSlot(move.clientX, move.clientY), j);
        this.#inserts.forEach((node, k) => node.classList.toggle("is-target", k === slot));
      };
      const onUp = () => {
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", onUp);
        element.removeEventListener("pointercancel", onUp);
        this.#root?.classList.remove("is-dragging");
        this.#inserts.forEach((node) => node.classList.remove("is-target"));
        if (!dragging) return this.close(j);
        element.classList.remove("is-dragging");
        this.#poseOnGrid(tile, j, { delay: 0 });
        // Slots j and j + 1 are both "where it already is".
        if (slot !== null && slot !== j && slot !== j + 1) this.#context.onMove(tile.id, slot);
      };
      element.addEventListener("pointermove", onMove);
      element.addEventListener("pointerup", onUp);
      element.addEventListener("pointercancel", onUp);
    });
  }

  #nearestSlot(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (let k = 0; k <= this.#context.model.N; k++) {
      const point = this.#slotPoint(k);
      const distance = Math.hypot(point.x - x, (point.y - y) * 1.6);
      if (distance < bestDistance) {
        best = k;
        bestDistance = distance;
      }
    }
    return best;
  }

  static #initiatives(model) {
    return model.ring.map((vm) => vm.initiative);
  }

  /**
   * RF-69: a "+" between two positions opens the quick form for a virtual
   * position. The last one before those without initiative says why it is the last.
   */
  #buildInsert(k, { beforeUnrolled = false } = {}) {
    const point = this.#slotPoint(k);
    const label = game.i18n.localize(`${I18N_ROOT}.Grid.${beforeUnrolled ? "InsertBeforeUnrolled" : "Insert"}`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scw-overview-insert";
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y}px`;
    button.innerHTML = `<i class="fa-solid fa-plus" aria-hidden="true"></i>`;
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
    button.addEventListener("click", () => this.#openPopover(k, point));
    return button;
  }

  #openPopover(slot, point) {
    this.#closePopover();
    const t = (key) => game.i18n.localize(`${I18N_ROOT}.${key}`);
    const form = document.createElement("form");
    form.className = "scw-overview-popover";
    OverviewLayer.#placePopover(form, point);
    const templates = this.#context.templates?.() ?? [];
    const options = templates
      .map((template) => `<option value="${template.id}">${foundry.utils.escapeHTML(template.name)}</option>`)
      .join("");
    const manage = this.#context.onManageVirtual
      ? `<button type="button" class="scw-btn scw-btn--ghost scw-overview-popover-manage" data-manage><i class="fa-solid fa-gear" aria-hidden="true"></i></button>`
      : "";
    form.innerHTML = `
      <span class="scw-details-kicker">${t("Grid.NewVirtual")}</span>
      <input type="text" name="name" required>
      <textarea name="text" rows="3"></textarea>
      <div class="scw-overview-popover-image">
        <img alt="" data-image-preview>
        <file-picker name="img" type="image"></file-picker>
      </div>
      <select name="templateId"><option value="">${t("Grid.NoTemplate")}</option>${options}</select>
      <div class="scw-overview-popover-actions">
        ${manage}
        <button type="button" class="scw-btn scw-btn--secondary scw-btn--label" data-cancel>${t("Grid.Cancel")}</button>
        <button type="submit" class="scw-btn scw-btn--primary scw-btn--label">${t("Grid.Add")}</button>
      </div>`;
    form.elements.name.placeholder = t("Grid.TitlePlaceholder");
    form.elements.text.placeholder = t("Grid.MessagePlaceholder");
    form.querySelector("[data-cancel]").addEventListener("click", () => this.#closePopover());
    const manageButton = form.querySelector("[data-manage]");
    if (manageButton) {
      const label = t("Grid.ManageVirtual");
      manageButton.setAttribute("aria-label", label);
      manageButton.dataset.tooltip = label;
      manageButton.addEventListener("click", () => {
        this.#closePopover();
        this.#context.onManageVirtual();
      });
    }
    // The picture: one picked here, else the template's, else the default — shown as it will be.
    const picker = form.querySelector("file-picker");
    const preview = form.querySelector("[data-image-preview]");
    picker.setAttribute("placeholder", t("Grid.ImagePlaceholder"));
    const pickedImage = () => String(picker.value ?? "").trim();
    const showImage = () => {
      const template = templates.find((candidate) => candidate.id === form.elements.templateId.value);
      preview.src = pickedImage() || template?.img || DEFAULT_VIRTUAL_IMAGE;
    };
    form.addEventListener("change", showImage);
    form.addEventListener("input", showImage);
    showImage();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = {
        name: form.elements.name.value.trim(),
        text: form.elements.text.value.trim(),
        img: pickedImage(),
        templateId: form.elements.templateId.value,
      };
      if (!data.name && !data.templateId) return form.elements.name.focus();
      const { slot: current } = this.#popoverPlace;
      this.#closePopover();
      this.#context.onInsert(current, data);
    });
    this.#inserts[slot]?.classList.add("is-target");
    this.#root.append(form);
    // The picker builds its own field once on the page.
    picker.querySelector("input")?.setAttribute("placeholder", t("Grid.ImagePlaceholder"));
    this.#popover = form;
    const ring = this.#context.model.ring;
    this.#popoverPlace = { beforeId: ring[slot - 1]?.id ?? null, afterId: ring[slot]?.id ?? null, slot };
    form.elements.name.focus();
  }

  #closePopover() {
    this.#popover?.remove();
    this.#popover = null;
    this.#popoverPlace = null;
    this.#inserts.forEach((node) => node.classList.remove("is-target"));
  }

  /* -------------------------------------------- */
  /*  Poses                                       */
  /* -------------------------------------------- */

  /** The tile as the slice it came from, with ring index `center` on the anchor. */
  #poseOnWheel(tile, j, center, { transition, delay = 0 }) {
    const { model, layout, base, viewT, viewIndex, scale, grid } = this.#context;
    const position = shortestOffset(0, j - center + layout.offset, model.N);
    const k = position - layout.offset;
    // The wheel draws nothing before the first turn of the combat.
    const sequence = viewT - shortestOffset(center, viewIndex, model.N) + k;
    const visible = Math.abs(position) <= layout.V && sequence >= 0;
    let opacity = visible ? (k < 0 ? PAST_OPACITY : 1) : 0;
    if (tile.hidden) opacity *= HIDDEN_OPACITY;

    this.#setTransition(tile, transition, delay);
    if (layout.view !== "wheel") return this.#poseOnTrack(tile, position, opacity);
    Object.assign(tile.element.style, {
      transform: `translate(0px, 0px) rotate(${base + position * layout.step}deg) scale(${scale})`,
      clipPath: k === 0 ? layout.activeSector : layout.sector,
      opacity: String(opacity),
    });
    const box = k === 0 ? layout.activePortrait : layout.portrait;
    const dx = box.left + box.size / 2 - layout.Rm;
    const dy = box.top + box.size / 2 - layout.Rm;
    tile.portrait.style.transform =
      `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${-base}deg) scale(${(box.size / grid.tile).toFixed(4)})`;
  }

  /** A card view (RF-90): the tile as the card of window position `position`, seen flat. */
  #poseOnTrack(tile, position, opacity) {
    const { layout, scale, grid } = this.#context;
    const pose = trackPose(layout, position);
    // The square portrait covers the card; the clip cuts it to the card's shape.
    const cover = Math.max(layout.cardWidth, layout.cardHeight) * pose.scale;
    Object.assign(tile.element.style, {
      transform: `translate(${(pose.center.x * scale).toFixed(1)}px, ${(pose.center.y * scale).toFixed(1)}px) rotate(0deg) scale(${scale})`,
      clipPath: cardClip(layout, pose.scale),
      opacity: String(opacity),
    });
    tile.portrait.style.transform = `translate(0px, 0px) rotate(0deg) scale(${(cover / grid.tile).toFixed(4)})`;
  }

  #poseOnGrid(tile, j, { delay, transition = true }) {
    const { layout, grid, anchor } = this.#context;
    const center = this.#cellCenter(j);
    this.#setTransition(tile, transition, delay);
    Object.assign(tile.element.style, {
      transform: `translate(${(center.x - anchor.x).toFixed(1)}px, ${(center.y - anchor.y).toFixed(1)}px) rotate(0deg) scale(1)`,
      clipPath: gridClip(layout, grid.tile),
      opacity: tile.hidden ? "0.6" : "1",
    });
    tile.portrait.style.transform = "translate(0px, 0px) rotate(0deg) scale(1)";
  }

  #setTransition(tile, on, delay) {
    tile.element.style.transition = on
      ? `transform ${MOVE_MS}ms ${EASE} ${delay}ms, clip-path ${MOVE_MS}ms ${EASE} ${delay}ms, opacity 450ms ease ${delay}ms`
      : "none";
    tile.portrait.style.transition = on ? `transform ${MOVE_MS}ms ${EASE} ${delay}ms` : "none";
  }

  #later(fn, ms) {
    this.#timers.push(setTimeout(fn, ms));
  }

  static #box({ left, top, width, height }) {
    return { left: `${left.toFixed(1)}px`, top: `${top.toFixed(1)}px`, width: `${width.toFixed(1)}px`, height: `${height.toFixed(1)}px` };
  }
}
