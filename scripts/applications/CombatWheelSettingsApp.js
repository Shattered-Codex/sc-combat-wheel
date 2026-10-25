import { I18N_ROOT, MODULE_ID, TEMPLATE_ROOT } from "../constants/module-constants.js";
import { SETTING_SECTIONS, SETTINGS_SCHEMA, coerceSetting, isSettingShown, settingDefault } from "../constants/settings-schema.js";
import { getSetting, setSetting } from "../hooks/register-settings.js";
import { normalizeTemplate } from "../helpers/virtual-positions.js";
import { CONSEQUENCE_KINDS, newConsequence } from "../helpers/consequence-kinds.js";
import CoreCombatSettings from "../services/CoreCombatSettings.js";
import VirtualPositions from "../services/VirtualPositions.js";
import CombatWheelAppearanceApp from "./CombatWheelAppearanceApp.js";
import SettingFieldView from "./SettingFieldView.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key) => game.i18n.localize(`${I18N_ROOT}.${key}`);
const SCOPE_ICONS = Object.freeze({ user: "fa-solid fa-user", client: "fa-solid fa-display", world: "fa-solid fa-globe" });

/**
 * The module's settings screen (RF-70 to RF-72), laid out like the other SC
 * settings windows: an icon rail grouped by scope, one panel per section, and a
 * footer with an unsaved-changes pill next to the actions. Every panel stays in
 * the form, so switching sections never re-renders. Edits live in a draft until
 * "Save", so adding a template or resetting a section never loses what was typed.
 */
export default class CombatWheelSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-settings`,
    tag: "form",
    classes: [`${MODULE_ID}-settings`],
    window: { title: `${I18N_ROOT}.SettingsMenu.Name`, icon: "fa-solid fa-dharmachakra", resizable: true },
    position: { width: 820, height: 640 },
    form: { handler: CombatWheelSettingsApp.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      section: CombatWheelSettingsApp.#onSection,
      resetSection: CombatWheelSettingsApp.#onResetSection,
      closeWindow: CombatWheelSettingsApp.#onCloseWindow,
      openAppearance: CombatWheelSettingsApp.#onOpenAppearance,
      resetPosition: CombatWheelSettingsApp.#onResetPosition,
      addTemplate: CombatWheelSettingsApp.#onAddTemplate,
      removeTemplate: CombatWheelSettingsApp.#onRemoveTemplate,
      removeConsequence: CombatWheelSettingsApp.#onRemoveConsequence,
      addToCombat: CombatWheelSettingsApp.#onAddToCombat,
    },
  };

  static PARTS = {
    form: { template: `${TEMPLATE_ROOT}/settings.hbs`, scrollable: [".scw-config__content"] },
  };

  #section = null;
  /** Unsaved values by setting key, plus the template list being edited. */
  #draft = null;
  /** Per-section snapshots of the form taken while it matched what is saved; null until the next render. */
  #baselines = null;
  #saved = false;
  /** The form element survives re-renders, so its listeners are bound once per element. */
  #boundRoot = null;

  /** Opens the screen on a given section (the wheel's "manage" link uses "virtual"); a hidden editor section opens its editor tab. */
  static open(section) {
    const linked = SETTING_SECTIONS.find((entry) => entry.id === section && entry.hidden && entry.kind === "editor");
    if (linked) return CombatWheelAppearanceApp.open(linked.panel);
    const app = foundry.applications.instances.get(`${MODULE_ID}-settings`) ?? new CombatWheelSettingsApp();
    if (app.rendered) app.#captureDraft();
    if (CombatWheelSettingsApp.#visibleSections().some((entry) => entry.id === section)) app.#section = section;
    return app.render({ force: true });
  }

  /** World sections are GM-only (RF-71): a player sees just what they can save. Hidden ones live in an editor. */
  static #visibleSections() {
    return SETTING_SECTIONS.filter((section) => !section.hidden && (section.scope !== "world" || game.user.isGM));
  }

  static #entriesOf(sectionId) {
    return SETTINGS_SCHEMA.filter((entry) => entry.section === sectionId);
  }

  /** The settings this window edits: an editor section's belong to that editor, never to this draft. */
  static #visibleEntries() {
    const ids = new Set(
      CombatWheelSettingsApp.#visibleSections().filter((section) => section.kind !== "editor").map((section) => section.id),
    );
    return SETTINGS_SCHEMA.filter((entry) => ids.has(entry.section));
  }

  #activeSection() {
    const sections = CombatWheelSettingsApp.#visibleSections();
    return sections.find((section) => section.id === this.#section) ?? sections[0];
  }

  async _prepareContext() {
    this.#draft ??= CombatWheelSettingsApp.#savedDraft();
    this.#section = this.#activeSection().id;
    const isGM = game.user.isGM;
    const macros = isGM
      ? game.macros.contents.map((macro) => ({ value: macro.uuid, label: macro.name })).sort((a, b) => a.label.localeCompare(b.label))
      : [];
    const sections = CombatWheelSettingsApp.#visibleSections().map((section) => ({
      id: section.id,
      icon: section.icon,
      scope: section.scope,
      scopeIcon: SCOPE_ICONS[section.scope],
      scopeLabel: t(`SettingsMenu.Scopes.${section.scope}.Badge`),
      title: t(`SettingsMenu.Sections.${section.id}.Title`),
      hint: t(`SettingsMenu.Sections.${section.id}.Hint`),
      active: section.id === this.#section,
      isVirtual: section.kind === "virtual",
      isEditor: section.kind === "editor",
      isCore: section.kind === "core",
      editor: section.kind === "editor" ? CombatWheelSettingsApp.#editorLink(section) : null,
      // A wheel dragged out of reach can always be brought back from here.
      offersResetPosition: section.id === "behavior",
      fields: section.kind ? [] : CombatWheelSettingsApp.#entriesOf(section.id).map((entry) => this.#field(entry)),
    }));
    return {
      isGM,
      groups: ["user", "client", "world"]
        .map((scope) => ({
          scope,
          icon: SCOPE_ICONS[scope],
          label: t(`SettingsMenu.Scopes.${scope}.Label`),
          sections: sections.filter((section) => section.scope === scope),
        }))
        .filter((group) => group.sections.length),
      sections,
      core: { tracker: CoreCombatSettings.trackerFields(this.#draft.core.tracker) },
      hasCombat: Boolean(game.combat),
      templates: this.#draft.templates.map((template, index) => ({
        ...template,
        index,
        consequences: template.consequences.map((row, rowIndex) => CombatWheelSettingsApp.#consequenceView(row, index, rowIndex, macros)),
      })),
      kinds: Object.entries(CONSEQUENCE_KINDS).map(([kind, meta]) => ({
        kind,
        label: t(`Consequence.Kinds.${kind}`),
        unavailable: Boolean(meta.requires && !game.modules.get(meta.requires)?.active),
      })),
    };
  }

  /** What a section edited in the appearance editor shows here: a line saying so, and a button to its tab. */
  static #editorLink(section) {
    return { panel: section.panel ?? "", name: t("Appearance.Open"), hint: t("Appearance.OpenHint") };
  }

  /** RF-68: one consequence row, its fields named for FormDataExtended. */
  static #consequenceView(row, templateIndex, rowIndex, macros) {
    const meta = CONSEQUENCE_KINDS[row.kind];
    const base = `templates.${templateIndex}.consequences.${rowIndex}`;
    return {
      id: row.id,
      index: rowIndex,
      templateIndex,
      kind: row.kind,
      label: t(`Consequence.Kinds.${row.kind}`),
      icon: meta.icon,
      enabled: row.enabled,
      base,
      requires: meta.requires ?? null,
      missing: Boolean(meta.requires && !game.modules.get(meta.requires)?.active),
      fields: meta.fields.map((field) => {
        const value = row.params[field.name];
        return {
          label: t(`Consequence.Fields.${field.name}`),
          name: `${base}.params.${field.name}`,
          value,
          [`is${field.type[0].toUpperCase()}${field.type.slice(1)}`]: true,
          min: field.min,
          max: field.max,
          fileType: field.fileType,
          documentName: field.documentName,
          choices: (field.choices ?? []).map((choice) => ({
            value: choice,
            label: t(`Consequence.Choices.${field.name}.${choice}`),
            selected: choice === value,
          })),
          macros: field.type === "macro" ? macros.map((m) => ({ ...m, selected: m.value === value })) : null,
        };
      }),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (this.#boundRoot !== root) {
      this.#boundRoot = root;
      root.addEventListener("input", () => this.#refreshStatus());
      root.addEventListener("change", (event) => {
        // As in the core window, the marker's own fields only apply while markers are on.
        if (event.target.name === "core.tracker.markerEnabled") {
          for (const field of root.querySelectorAll("[data-marker-field]")) field.disabled = !event.target.checked;
        }
        this.#refreshRows();
        this.#refreshStatus();
      });
      root.addEventListener("keydown", (event) => this.#onRailKeydown(event));
    }
    // Adding a consequence is a <select>: pick a kind, get a row.
    for (const select of root.querySelectorAll("[data-add-consequence]")) {
      select.addEventListener("change", () => {
        if (!select.value) return;
        this.#captureDraft();
        this.#draft.templates[Number(select.dataset.addConsequence)]?.consequences.push(newConsequence(select.value));
        this.render();
      });
    }
    // Document fields take a drop from the sidebar or a compendium.
    for (const input of root.querySelectorAll("[data-drop-uuid]")) {
      input.addEventListener("dragover", (event) => event.preventDefault());
      input.addEventListener("drop", (event) => {
        event.preventDefault();
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        if (data?.uuid) input.value = data.uuid;
        this.#refreshStatus();
      });
    }
    this.#baselines ??= this.#snapshots(this.#formData());
    this.#syncResetButton();
    this.#refreshStatus();
  }

  #field(entry) {
    return { ...SettingFieldView.of(entry, this.#draft.values[entry.key]), shown: isSettingShown(entry, this.#draft.values) };
  }

  /** RF-97: a row another value makes meaningless (a sound's file, the HP path) comes and goes with it. */
  #refreshRows() {
    this.#captureDraft();
    for (const entry of CombatWheelSettingsApp.#visibleEntries()) {
      if (!entry.visibleWhen) continue;
      const row = this.element.querySelector(`[data-setting-row="${entry.key}"]`);
      if (row) row.hidden = !isSettingShown(entry, this.#draft.values);
    }
  }

  static #savedDraft() {
    const values = {};
    for (const entry of CombatWheelSettingsApp.#visibleEntries()) values[entry.key] = getSetting(entry.key);
    return {
      values,
      templates: game.user.isGM ? VirtualPositions.templates() : [],
      core: { tracker: CoreCombatSettings.trackerValues() },
    };
  }

  #formData() {
    return foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
  }

  /** The templates as typed, keeping the ids the draft gave them. */
  #templatesFrom(data) {
    return Object.values(data.templates ?? {}).map((raw, i) => normalizeTemplate({ ...raw, id: this.#draft.templates[i]?.id }));
  }

  /** Copies what is on screen into the draft, before any re-render. */
  #captureDraft() {
    if (!this.element || !this.#draft) return;
    const data = this.#formData();
    for (const entry of CombatWheelSettingsApp.#visibleEntries()) {
      const value = coerceSetting(entry, data[entry.key]);
      if (value !== null) this.#draft.values[entry.key] = value;
    }
    if (game.user.isGM) this.#draft.templates = this.#templatesFrom(data);
    this.#draft.core.tracker = CoreCombatSettings.trackerFromForm(data.core, this.#draft.core.tracker) ?? this.#draft.core.tracker;
  }

  /* -------------------------------------------- */
  /*  Sections and status                         */
  /* -------------------------------------------- */

  /** A stable string per section, so one tab's edits never mark another dirty. */
  #snapshots(data) {
    const snapshots = {};
    for (const section of CombatWheelSettingsApp.#visibleSections()) {
      if (section.kind === "editor") continue;
      if (section.kind === "virtual") snapshots[section.id] = JSON.stringify(this.#templatesFrom(data));
      else if (section.kind === "core") snapshots[section.id] = JSON.stringify(CoreCombatSettings.trackerFromForm(data.core, this.#draft.core.tracker));
      else {
        const values = CombatWheelSettingsApp.#entriesOf(section.id).map((entry) => coerceSetting(entry, data[entry.key]));
        snapshots[section.id] = JSON.stringify(values);
      }
    }
    return snapshots;
  }

  #refreshStatus() {
    const root = this.element;
    if (!root || !this.#baselines) return;
    const current = this.#snapshots(this.#formData());
    let anyDirty = false;
    for (const [id, snapshot] of Object.entries(current)) {
      const dirty = snapshot !== this.#baselines[id];
      anyDirty ||= dirty;
      const dot = root.querySelector(`[data-section-dot="${id}"]`);
      if (dot) dot.hidden = !dirty;
    }
    if (anyDirty) this.#saved = false;
    root.querySelector("[data-save-button]")?.classList.toggle("is-dirty", anyDirty);

    const pill = root.querySelector("[data-status-pill]");
    const label = root.querySelector("[data-status-pill-label]");
    if (!pill || !label) return;
    pill.classList.toggle("scw-config-pill--unsaved", anyDirty);
    pill.classList.toggle("scw-config-pill--saved", !anyDirty && this.#saved);
    pill.hidden = !anyDirty && !this.#saved;
    label.textContent = anyDirty ? t("SettingsMenu.Unsaved") : this.#saved ? t("SettingsMenu.Saved") : "";
  }

  #selectSection(id) {
    if (!CombatWheelSettingsApp.#visibleSections().some((section) => section.id === id)) return;
    this.#section = id;
    for (const tab of this.element.querySelectorAll("[data-section-tab]")) {
      const active = tab.dataset.sectionTab === id;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of this.element.querySelectorAll("[data-section-panel]")) panel.hidden = panel.dataset.sectionPanel !== id;
    this.#syncResetButton();
  }

  /** Only sections of setting rows have defaults to go back to here; the appearance editor resets its own. */
  #syncResetButton() {
    const reset = this.element?.querySelector("[data-reset-button]");
    if (reset) reset.hidden = Boolean(this.#activeSection().kind);
  }

  /** Arrow keys, Home and End walk the rail, as in any tab list. */
  #onRailKeydown(event) {
    const tab = event.target.closest?.('[role="tab"]');
    if (!tab) return;
    const tabs = [...this.element.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(tab);
    const moves = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    next.focus();
    this.#selectSection(next.dataset.sectionTab);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSection(event, target) {
    this.#selectSection(target.dataset.sectionTab);
  }

  /** Puts the visible section back to its defaults; nothing is written until "Save". */
  static #onResetSection() {
    const section = this.#activeSection();
    if (section.kind) return;
    this.#captureDraft();
    for (const entry of CombatWheelSettingsApp.#entriesOf(section.id)) this.#draft.values[entry.key] = settingDefault(entry);
    this.render();
  }

  static #onCloseWindow() {
    return this.close();
  }

  /** Saved at once: it is an action, not a value for the draft. */
  static async #onResetPosition() {
    await game.modules.get(MODULE_ID).api?.resetPosition();
    ui.notifications.info(`${I18N_ROOT}.Notifications.PositionReset`, { localize: true });
  }

  /** Opens the appearance editor, on the section's own tab when it has one (sounds). */
  static #onOpenAppearance(event, target) {
    return CombatWheelAppearanceApp.open(target.dataset.panel || undefined);
  }

  static #onAddTemplate() {
    this.#captureDraft();
    this.#draft.templates.push(normalizeTemplate({ name: t("Virtual.NewName"), initiative: 20 }));
    this.render();
  }

  static #onRemoveConsequence(event, target) {
    this.#captureDraft();
    this.#draft.templates[Number(target.dataset.template)]?.consequences.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onRemoveTemplate(event, target) {
    this.#captureDraft();
    this.#draft.templates.splice(Number(target.dataset.index), 1);
    this.render();
  }

  /** Saves first, so the combat gets exactly what is on screen. */
  static async #onAddToCombat(event, target) {
    this.#captureDraft();
    await this.#save();
    const template = this.#draft.templates[Number(target.dataset.index)];
    const combatant = await VirtualPositions.addToCombat(game.combat, template?.id);
    if (combatant) ui.notifications.info(game.i18n.format(`${I18N_ROOT}.Notifications.VirtualAdded`, { name: combatant.name }));
    this.render();
  }

  static async #onSubmit() {
    this.#captureDraft();
    await this.#save();
    // RF-72: saving always answers.
    ui.notifications.info(`${I18N_ROOT}.Notifications.SettingsSaved`, { localize: true });
    this.render();
  }

  /** Writes what changed; the next render takes the saved state as the new baseline. */
  async #save() {
    const writes = [];
    for (const entry of CombatWheelSettingsApp.#visibleEntries()) {
      const value = this.#draft.values[entry.key];
      if (value !== getSetting(entry.key)) writes.push(setSetting(entry.key, value));
    }
    if (game.user.isGM) writes.push(VirtualPositions.saveTemplates(this.#draft.templates));
    writes.push(CoreCombatSettings.save(this.#draft.core));
    await Promise.all(writes);
    this.#draft.templates = game.user.isGM ? VirtualPositions.templates() : [];
    this.#draft.core = { tracker: CoreCombatSettings.trackerValues() };
    this.#baselines = null;
    this.#saved = true;
  }

  _onClose(options) {
    super._onClose(options);
    this.#draft = null;
    this.#baselines = null;
    this.#saved = false;
  }
}
