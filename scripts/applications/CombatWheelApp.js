import { ANIMATION_SPEED, MODULE_ID, SETTINGS, TEMPLATE_ROOT } from "../constants/module-constants.js";
import { shortestOffset } from "../helpers/wheel-geometry.js";
import { layoutFromSettings } from "../helpers/view-layout.js";
import { normalizeOrientation } from "../helpers/orientation.js";
import { initiativeBetween, initiativeForMove } from "../helpers/initiative-order.js";
import { activeTheme, appearanceValues, currentStyleId, getSetting, savedStyles, setSetting } from "../hooks/register-settings.js";
import { projectCombat } from "../services/project-combat.js";
import CombatControls from "../services/CombatControls.js";
import StylePicker from "../services/StylePicker.js";
import TokenInteractions from "../services/TokenInteractions.js";
import VirtualPositions from "../services/VirtualPositions.js";
import WidgetPosition from "../services/WidgetPosition.js";
import CombatWheelAppearanceApp from "./CombatWheelAppearanceApp.js";
import CombatWheelSettingsApp from "./CombatWheelSettingsApp.js";
import WheelAnimator from "./WheelAnimator.js";
import OverviewLayer from "./OverviewLayer.js";
import WheelAppearance from "./WheelAppearance.js";
import WheelParticles from "./WheelParticles.js";
import WheelFxLayer from "./WheelFxLayer.js";
import WheelRenderer from "./WheelRenderer.js";
import WheelViewData from "./WheelViewData.js";
import SliceMenu from "./SliceMenu.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const HIDE_TRACKER_CLASS = "scw-hide-native-tracker";

/**
 * The initiative wheel: a frameless ApplicationV2 whose root is a zero-size
 * anchor at the middle of the bar's arc-side edge (ARCHITECTURE §4).
 * The `wheel` part is driven imperatively by WheelRenderer; `hub` and `bar`
 * are plain templates re-rendered when the combat changes.
 */
export default class CombatWheelApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: MODULE_ID,
    tag: "section",
    classes: [MODULE_ID],
    window: { frame: false, positioned: false },
    actions: {
      nextTurn: CombatWheelApp.#onNextTurn,
      endTurn: CombatWheelApp.#onEndTurn,
      toggleMenu: CombatWheelApp.#onToggleMenu,
      previousTurn: CombatWheelApp.#onPreviousTurn,
      startCombat: CombatWheelApp.#onStartCombat,
      endCombat: CombatWheelApp.#onEndCombat,
      endOwnTurn: CombatWheelApp.#onEndOwnTurn,
      toggleMemberDone: CombatWheelApp.#onToggleMemberDone,
      toggleLock: CombatWheelApp.#onToggleLock,
      setOrientation: CombatWheelApp.#onSetOrientation,
      toggleExpand: CombatWheelApp.#onToggleExpand,
      roll: CombatWheelApp.#onRoll,
      rollPending: CombatWheelApp.#onRollPending,
      openGrid: CombatWheelApp.#onOpenGrid,
      addVirtual: CombatWheelApp.#onAddVirtual,
      openSettings: CombatWheelApp.#onOpenSettings,
      openAppearance: CombatWheelApp.#onOpenAppearance,
      applyStyle: CombatWheelApp.#onApplyStyle,
      backToTurn: CombatWheelApp.#onBackToTurn,
      viewStep: CombatWheelApp.#onViewStep,
    },
  };

  static PARTS = {
    wheel: { template: `${TEMPLATE_ROOT}/wheel.hbs` },
    hub: { template: `${TEMPLATE_ROOT}/hub.hbs` },
    bar: { template: `${TEMPLATE_ROOT}/bar.hbs` },
  };

  #renderer = new WheelRenderer();
  #particles = new WheelParticles();
  #actingFx = new WheelFxLayer("acting");
  #widgetFx = new WheelFxLayer("widget");
  #grid = new OverviewLayer();
  /** Order signature of the ring the overview shows, to refresh it after a move or insert. */
  #gridSignature = "";
  /** Ring index being viewed without changing the turn (RF-21); null follows the real turn. */
  #viewIndex = null;
  #animator = new WheelAnimator(this.#renderer);
  #model = null;
  #layout = null;
  #orientation = "up";
  #turnFxPending = false;
  /** This user's look (RF-91), read once per render. */
  #look = null;
  /** `menu` is the bar's open popover: "more", "roll", "virtual", "direction" or null. */
  #ui = { menu: null, rolling: false };
  /** Room the phase strip takes beyond the bar (RF-80); the widget is kept on screen with it. */
  #trayDepth = 0;
  #onResize = () => this.#placeWidget();

  /** The combat currently drawn; `game.combat` may already point elsewhere. */
  get combatId() {
    return this.#model?.combatId ?? null;
  }

  get combat() {
    return game.combat ?? null;
  }

  /** Shown or being drawn: a render asked for meanwhile waits in ApplicationV2's queue instead of being lost. */
  get isOpen() {
    const { RENDERING, RENDERED } = ApplicationV2.RENDER_STATES;
    return this.state === RENDERING || this.state === RENDERED;
  }

  /** Used before auto-opening: a player who can see nobody gets no widget. */
  hasVisibleCombatants(combat) {
    return (this.#project(combat)?.N ?? 0) > 0;
  }

  /** Re-projects the combat and updates the wheel, hub and bar. */
  refreshCombat() {
    if (!this.isOpen) return;
    if (!this.combat) return this.close();
    return this.render({ parts: ["hub", "bar"] });
  }

  nextTurn() {
    return CombatControls.nextTurn(this.combat);
  }

  previousTurn() {
    return CombatControls.previousTurn(this.combat);
  }

  /** RF-20: opens the overview, or closes it if it is already open. */
  toggleGrid() {
    if (this.#grid.isOpen) return this.#grid.close();
    const model = this.#model;
    if (!this.rendered || !model?.N || model.phased) return;
    this.#ui.menu = null;
    this.element.classList.add("is-grid");
    this.#gridSignature = CombatWheelApp.#ringSignature(model);
    const isGM = game.user.isGM;
    this.#grid.open({
      model,
      layout: this.#layout,
      orientation: this.#orientation,
      anchor: { x: parseFloat(this.element.style.left) || 0, y: parseFloat(this.element.style.top) || 0 },
      scale: this.#look.scale / 100,
      theme: activeTheme(this.#look),
      viewIndex: this.#viewIndex ?? model.currentIndex,
      viewT: this.#viewT(),
      // Read when the form opens: templates set up meanwhile are offered at once.
      templates: () => (isGM ? VirtualPositions.templates() : []),
      onClosed: (combatantId, pickedOn) => this.#onGridClosed(combatantId, pickedOn),
      onMove: isGM ? (id, slot) => this.#moveCombatant(id, slot) : null,
      onInsert: isGM ? (slot, data) => this.#insertVirtual(slot, data) : null,
      onManageVirtual: isGM ? () => CombatWheelSettingsApp.open("virtual") : null,
      onRemove: isGM ? (id) => this.combat?.combatants.get(id)?.delete() : null,
    });
  }

  /** Everything an overview tile and its header draw: the order, the turn, and each portrait's content. */
  static #ringSignature(model) {
    const tiles = model.ring.map((vm) => [vm.id, vm.initiative, vm.name, vm.initials, vm.img, vm.imgPosition, vm.dispositionKey, vm.concealed, vm.dead, vm.virtual].join(":"));
    return [CombatWheelApp.#turnKey(model), model.currentIndex, model.activeHidden, ...tiles].join("|");
  }

  /** RF-33: a dragged portrait takes an initiative between its new neighbours. */
  #moveCombatant(combatantId, slot) {
    const ring = this.#model.ring;
    const from = ring.findIndex((vm) => vm.id === combatantId);
    if (from < 0) return;
    const initiative = initiativeForMove(ring.map((vm) => vm.initiative), from, slot);
    return this.combat?.combatants.get(combatantId)?.update({ initiative });
  }

  /** RF-69: a virtual position created right where the GM clicked "+". */
  #insertVirtual(slot, data) {
    const ring = this.#model.ring;
    const initiative = initiativeBetween(ring[slot - 1]?.initiative ?? null, ring[slot]?.initiative ?? null);
    return VirtualPositions.addAt(this.combat, { ...data, initiative });
  }

  /** RF-22: rotates back to the real turn, step by step the short way. */
  backToTurn() {
    if (this.#viewIndex === null) return;
    this.#setViewIndex(null);
    return this.render({ parts: ["hub", "bar"] });
  }

  toggleLock() {
    const { locked } = WidgetPosition.state();
    return WidgetPosition.save({ locked: !locked }).then(() => this.render({ parts: ["bar"] }));
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    this.#look = appearanceValues();
    if (options.parts.includes("wheel")) this.#readLayout();
    const previous = this.#model;
    this.#model = this.#project(this.combat);
    this.#settleView(previous, this.#model);
    const state = WidgetPosition.state();
    const look = this.#look;
    // RF-111: the details are offered by their item in the bar; a split bar has no room for them (RF-104).
    const details = !(look.barHidden ?? []).includes("details") && !WheelAppearance.isSplit(look);
    return {
      isGM: game.user.isGM,
      model: this.#model,
      ui: {
        ...this.#ui,
        locked: state.locked,
        details,
        expanded: details && state.expanded,
        controls: look.barControls,
        layout: look.barLayout,
        barHidden: look.barHidden,
        stripImage: look.phaseStripImage,
        canMarkDone: CombatControls.canMarkMembers(),
        orientation: this.#orientation,
        viewIndex: this.#viewIndex,
        virtualTemplates: game.user.isGM ? VirtualPositions.templates() : [],
        savedStyles: game.user.isGM ? CombatWheelApp.#styleChoices() : [],
      },
    };
  }

  /**
   * A real turn change ends the local view (RF-22); a changed ring also drops
   * the grid, whose tiles would point at the wrong combatants.
   */
  #settleView(previous, model) {
    if (!previous || !model) return;
    const ringChanged = previous.combatId !== model.combatId || previous.N !== model.N;
    const turnChanged = ringChanged || CombatWheelApp.#turnKey(previous) !== CombatWheelApp.#turnKey(model);
    if (turnChanged) this.#setViewIndex(null);
    // RF-100: a real turn change of the same combat plays the turn effect once drawn.
    this.#turnFxPending ||= !ringChanged && previous.T !== model.T;
    if (!this.#grid.isOpen) return;
    if (previous.combatId !== model.combatId || !model.N) {
      this.#grid.destroy();
      this.element?.classList.remove("is-grid");
      return;
    }
    // A move, an insert, a removal, the turn or a portrait changed: re-lay the open overview.
    const signature = CombatWheelApp.#ringSignature(model);
    if (signature !== this.#gridSignature) {
      this.#gridSignature = signature;
      this.#grid.refresh(model);
    }
  }

  /**
   * Which turn is running. Not T: while the acting combatant is hidden from a
   * player, T already points at the next visible one, so that one's own turn
   * would read as the same. The combat's own round and turn tell them apart.
   * Under Venaerys the turn is the phase, which T follows (a done mark moves
   * the pointer inside it).
   */
  static #turnKey(model) {
    return model.phased ? `T${model.T}` : `${model.round}:${model.turn}`;
  }

  /** The renderer marks the anchor and the real turn from whether someone is being viewed, not from T alone. */
  #setViewIndex(index) {
    this.#viewIndex = index;
    this.#renderer.viewing = index !== null;
  }

  /**
   * Viewing the acting combatant is the real turn again. While a player's
   * turn is on someone hidden the anchor rests on the next visible one, and
   * picking it is a view like any other.
   */
  static #viewIndexFor(index, model) {
    return index === model.currentIndex && !model.activeHidden ? null : index;
  }

  /** The turn on the anchor: the real one, or the one being viewed, the short way round. */
  #viewT() {
    const model = this.#model;
    if (!model?.N || this.#viewIndex === null) return model?.T ?? 0;
    return model.T + shortestOffset(model.currentIndex, this.#viewIndex, model.N);
  }

  /**
   * @param {string|null} combatantId  who was picked, or null
   * @param {object} pickedOn          the model the pick was made on: a real turn
   *   change during the flight back cancels the view, as it would have (RF-22)
   */
  #onGridClosed(combatantId, pickedOn) {
    const model = this.#model;
    const sameTurn = Boolean(pickedOn && model) && pickedOn.combatId === model.combatId && CombatWheelApp.#turnKey(pickedOn) === CombatWheelApp.#turnKey(model);
    // Gone meanwhile (removed or turned hidden): keep the view as it is.
    const index = combatantId === null || !sameTurn ? -1 : model.ring.findIndex((vm) => vm.id === combatantId);
    if (index !== -1) this.#setViewIndex(CombatWheelApp.#viewIndexFor(index, model));
    if (model) this.#animator.jump(model, this.#viewT());
    this.element?.classList.remove("is-grid");
    if (this.rendered) this.render({ parts: ["hub", "bar"] });
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "hub") context.hub = WheelViewData.hub(context.model, context.ui);
    if (partId === "bar") context.bar = WheelViewData.bar(context.model, context.ui);
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const element = this.element;
    const look = this.#look;
    WheelAppearance.applyLook(element, look, {
      orientation: this.#orientation,
      theme: activeTheme(look),
      expanded: context.ui.expanded,
    });
    document.body.classList.toggle(HIDE_TRACKER_CLASS, Boolean(getSetting(SETTINGS.hideNativeTracker)));

    if (options.parts.includes("wheel")) this.#mountWheel();
    if (options.parts.includes("bar")) {
      this.#bindBar(context.ui);
      WheelAppearance.fitPods(element, this.#layout);
    }
    // Only a strip beyond the bar pushes the widget away from the screen edge.
    const trayDepth = this.#model?.phase && look.phaseStripPlacement === "beyond" ? WheelAppearance.stripDepth(look) : 0;
    if (trayDepth !== this.#trayDepth) {
      this.#trayDepth = trayDepth;
      this.#placeWidget();
    }

    this.#animator.show(this.#model ?? CombatWheelApp.#emptyModel(), this.#motion(), this.#viewT());
    this.#particles.update(element, WheelAppearance.particleOptions(look, this.#layout, this.#orientation, this.#model));
    this.#widgetFx.update(element, WheelAppearance.widgetFxOptions(look, this.#layout, this.#orientation));
    this.#actingFx.update(element, WheelAppearance.actingFxOptions(look, this.#layout, this.#orientation));
    if (this.#turnFxPending) {
      this.#turnFxPending = false;
      WheelAppearance.playTurnEffect(element);
    }
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    window.addEventListener("resize", this.#onResize);
  }

  _onClose(options) {
    super._onClose(options);
    window.removeEventListener("resize", this.#onResize);
    document.body.classList.remove(HIDE_TRACKER_CLASS);
    TokenInteractions.hoverOut(new PointerEvent("pointerleave"));
    this.#animator.reset();
    this.#grid.destroy();
    SliceMenu.close();
    this.#renderer.unmount();
    this.#particles.destroy();
    this.#actingFx.destroy();
    this.#widgetFx.destroy();
    this.#setViewIndex(null);
    this.#model = null;
    this.#ui = { menu: null, rolling: false };
  }

  #project(combat) {
    return projectCombat(combat);
  }

  #readLayout() {
    this.#layout = layoutFromSettings(this.#look);
    this.#orientation = normalizeOrientation(this.#look.orientation);
  }

  #mountWheel() {
    const layout = this.#layout;
    WheelAppearance.applyGeometry(this.element, layout, { scale: this.#look.scale / 100 });

    const container = this.element.querySelector("[data-application-part='wheel']");
    this.#animator.reset();
    this.#grid.destroy();
    this.element.classList.remove("is-grid");
    this.#renderer.mount(container, layout, {
      onClick: (id, event) => this.#runSliceAction(SETTINGS.clickAction, id, event),
      onDoubleClick: (id, event) => this.#runSliceAction(SETTINGS.doubleClickAction, id, event),
      onContextMenu: (id, event) => this.#runSliceAction(SETTINGS.rightClickAction, id, event),
      onHoverIn: (id, event) => TokenInteractions.hoverIn(this.combat, id, event),
      onHoverOut: (event) => TokenInteractions.hoverOut(event),
      onRollOne: (id) => CombatControls.rollOne(this.combat, id),
    });
    this.#placeWidget();
  }

  /**
   * RF-31: a click, double click or right click on a portrait runs the action
   * its setting names, or opens the slice's menu (RF-122). A right click keeps
   * the browser's own menu away only when it has something instead.
   */
  #runSliceAction(settingKey, combatantId, event) {
    // A click set to open the menu has already opened it twice: the double click starts clean.
    if (settingKey === SETTINGS.doubleClickAction) SliceMenu.close();
    const action = getSetting(settingKey);
    if (action === "none") return;
    if (action !== "menu") {
      event?.preventDefault();
      return TokenInteractions.click(this.combat, combatantId, action);
    }
    const items = this.#sliceMenuItems(combatantId);
    if (!items.length) return;
    event.preventDefault();
    // The keyboard's menu key gives no pointer: the menu opens by the portrait.
    const target = event.currentTarget instanceof Element ? event.currentTarget : event.target;
    const box = target?.getBoundingClientRect?.();
    const fromKeyboard = !event.clientX && !event.clientY && box;
    SliceMenu.open({
      x: fromKeyboard ? box.left + box.width / 2 : event.clientX,
      y: fromKeyboard ? box.top + box.height / 2 : event.clientY,
      title: this.#visibleName(combatantId),
      items,
      returnFocus: target?.closest?.("[tabindex]") ?? null,
    });
  }

  /**
   * RF-122: what this user may do with one combatant from the wheel — find
   * and open it like the clicks do, and for the GM, as the core tracker
   * offers, clear what its token moved this combat and take it out.
   */
  #sliceMenuItems(combatantId) {
    const combat = this.combat;
    const combatant = combat?.combatants.get(combatantId);
    if (!combatant) return [];
    const label = (key) => game.i18n.localize(`SC_COMBAT_WHEEL.SliceMenu.${key}`);
    const token = TokenInteractions.placeableFor(combat, combatantId);
    const items = [];
    if (token && TokenInteractions.isVisible(token)) items.push({ icon: "fa-crosshairs", label: label("Pan"), run: () => TokenInteractions.click(combat, combatantId, "pan") });
    if (token?.isOwner) items.push({ icon: "fa-hand-pointer", label: label("Select"), run: () => TokenInteractions.click(combat, combatantId, "select") });
    if (combatant.actor?.testUserPermission(game.user, "LIMITED")) {
      items.push({ icon: "fa-id-card", label: label("Sheet"), run: () => TokenInteractions.click(combat, combatantId, "sheet") });
    }
    if (CombatControls.canClearMovement(combatant)) {
      items.push({ icon: "fa-shoe-prints", label: label("ClearMovement"), run: () => CombatControls.clearMovement(combat, combatantId) });
    }
    if (game.user.isGM) items.push({ icon: "fa-trash-can", label: label("Remove"), danger: true, run: () => CombatControls.removeCombatant(combat, combatantId) });
    return items;
  }

  /** The name this user reads for a combatant on the wheel or the phase strip (never one the tracker hides). */
  #visibleName(combatantId) {
    const model = this.#model;
    const vm = model?.ring.find((entry) => entry.id === combatantId) ?? model?.phase?.acting.find((member) => member.id === combatantId);
    return vm?.name ?? "";
  }

  #placeWidget() {
    if (!this.#layout || !this.element) return;
    const anchor = WidgetPosition.anchor({
      orientation: this.#orientation,
      barWidth: this.#barSpan(),
      barThickness: this.#barThickness(),
      trayDepth: this.#trayDepth,
    });
    WidgetPosition.apply(this.element, anchor);
  }

  /** How long the bar lies across the anchor, for keeping it on screen: a split bar's columns stand past the portraits (RF-104). */
  #barSpan() {
    if (!WheelAppearance.isSplit(this.#look)) return this.#layout.barWidth;
    return 2 * (this.#layout.across + WheelAppearance.splitReach());
  }

  /** How far the bar reaches past the anchor, away from the portraits: nothing when split beside them or hidden. */
  #barThickness() {
    const look = this.#look;
    if (look.barVisibility === "hidden" || WheelAppearance.isSplit(look)) return 0;
    return WheelAppearance.barThickness(this.#orientation, false, look.barSize);
  }

  #bindBar(ui) {
    // The handle can be hidden (RF-99): the strip below still binds.
    const handle = this.element.querySelector("[data-drag-handle]");
    if (handle) {
      WidgetPosition.attachDrag(handle, this.element, {
        orientation: this.#orientation,
        barWidth: this.#barSpan(),
        barThickness: this.#barThickness(),
        trayDepth: () => this.#trayDepth,
        isLocked: () => WidgetPosition.state().locked,
      });
    }
    // The phase strip's portraits act like the slices: click per setting, hover highlights the token.
    for (const actor of this.element.querySelectorAll("[data-strip-combatant]")) {
      const id = actor.dataset.stripCombatant;
      actor.addEventListener("click", (event) => this.#runSliceAction(SETTINGS.clickAction, id, event));
      actor.addEventListener("dblclick", (event) => this.#runSliceAction(SETTINGS.doubleClickAction, id, event));
      actor.addEventListener("contextmenu", (event) => this.#runSliceAction(SETTINGS.rightClickAction, id, event));
      actor.addEventListener("pointerenter", (event) => TokenInteractions.hoverIn(this.combat, id, event));
      actor.addEventListener("pointerleave", (event) => TokenInteractions.hoverOut(event));
    }
    if (ui.menu) this.element.querySelector(".scw-roll-menu button:not(:disabled)")?.focus();
  }

  #motion() {
    return {
      speed: ANIMATION_SPEED[this.#look.animationSpeed] ?? 1,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }

  static #emptyModel() {
    return { combatId: null, N: 0, T: 0, ring: [], currentIndex: 0, activeHidden: false };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onNextTurn() {
    return this.nextTurn();
  }

  static #onPreviousTurn() {
    return this.previousTurn();
  }

  static #onStartCombat() {
    this.#closeMenu();
    return CombatControls.startCombat(this.combat);
  }

  static #onEndCombat() {
    this.#closeMenu();
    return CombatControls.endCombat(this.combat);
  }

  static #onEndOwnTurn() {
    return CombatControls.endOwnTurn(this.combat, this.#model);
  }

  static #onToggleMemberDone(event, target) {
    return CombatControls.toggleMemberDone(this.combat, target.dataset.combatantId, this.#model);
  }

  static #onToggleLock() {
    this.#ui.menu = null;
    return this.toggleLock();
  }

  static async #onSetOrientation(event, target) {
    const orientation = normalizeOrientation(target.dataset.orientation);
    if (WidgetPosition.state().locked || orientation === this.#orientation) return;
    this.#ui.menu = null;
    // The orientation setting's onChange rebuilds the wheel through the watcher.
    await setSetting(SETTINGS.orientation, orientation);
  }

  static async #onToggleExpand() {
    const { expanded } = WidgetPosition.state();
    await WidgetPosition.save({ expanded: !expanded });
    this.render({ parts: ["bar"] });
  }

  /** Opens one of the bar's popovers (or "More"), closing any other; the same button closes it. */
  static #onToggleMenu(event, target) {
    const menu = target.dataset.menu;
    this.#ui.menu = this.#ui.menu === menu ? null : menu;
    this.render({ parts: ["bar"] });
  }

  /** Closes the open popover before running one of its items. */
  #closeMenu() {
    if (!this.#ui.menu) return;
    this.#ui.menu = null;
    this.render({ parts: ["bar"] });
  }

  /** RF-10: the GM ends whoever is acting; a player only their own turn. */
  static #onEndTurn() {
    if (game.user.isGM) return this.nextTurn();
    return CombatControls.endOwnTurn(this.combat, this.#model);
  }

  static async #onAddVirtual(event, target) {
    this.#closeMenu();
    await VirtualPositions.addToCombat(this.combat, target.dataset.templateId);
  }

  static #onOpenSettings(event, target) {
    this.#closeMenu();
    return CombatWheelSettingsApp.open(target.dataset.tab);
  }

  /** RF-110: the saved styles for the bar's menu, the one the look is now marked. */
  static #styleChoices() {
    const styles = savedStyles();
    if (!styles.length) return [];
    const current = currentStyleId(styles);
    return styles.map(({ id, name }) => ({ id, name, current: id === current }));
  }

  /** Saving the look rebuilds the wheel through the settings' onChange. */
  static #onApplyStyle(event, target) {
    this.#closeMenu();
    return StylePicker.apply(target.dataset.styleId);
  }

  static #onOpenAppearance() {
    this.#closeMenu();
    return CombatWheelAppearanceApp.open();
  }

  static async #onRoll(event, target) {
    this.#closeMenu();
    await this.#rolling(() => CombatControls.roll(this.combat, target.dataset.group, this.#model));
  }

  static #onOpenGrid() {
    return this.toggleGrid();
  }

  static #onBackToTurn() {
    return this.backToTurn();
  }

  /** RF-11: steps the viewed combatant through the ring, in combat order. */
  static #onViewStep(event, target) {
    const model = this.#model;
    if (!model?.N) return;
    const from = this.#viewIndex ?? model.currentIndex;
    const next = (((from + Number(target.dataset.step)) % model.N) + model.N) % model.N;
    this.#setViewIndex(CombatWheelApp.#viewIndexFor(next, model));
    return this.render({ parts: ["hub", "bar"] });
  }

  static async #onRollPending() {
    await this.#rolling(() => CombatControls.rollPending(this.combat, this.#model));
  }

  /** Spins the d20 while the roll is in flight (RF-15). */
  async #rolling(roll) {
    this.#ui.rolling = true;
    await this.render({ parts: ["hub", "bar"] });
    try {
      await roll();
    } finally {
      this.#ui.rolling = false;
      if (this.rendered) this.render({ parts: ["hub", "bar"] });
    }
  }
}
