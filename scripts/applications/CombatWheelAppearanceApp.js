import { COLOR_SETTINGS, I18N_ROOT, MODULE_ID, SETTINGS, TEMPLATE_ROOT, VIEWS } from "../constants/module-constants.js";
import {
  APPEARANCE_PANELS,
  SETTINGS_SCHEMA,
  coerceSetting,
  isSettingShown,
  settingDefault,
} from "../constants/settings-schema.js";
import { APPEARANCE_PRESETS } from "../constants/appearance-presets.js";
import { FOLLOW_SYSTEM, THEME_GROUPS, resolveTheme } from "../helpers/themes.js";
import { isHexColor } from "../helpers/theme-colors.js";
import { soundEventFor } from "../helpers/turn-events.js";
import { contrastRatio, paletteFromColor, parseCssColor } from "../helpers/palette.js";
import { isPortraitRatioOk, portraitRatio, presetFromSettings } from "../helpers/wheel-geometry.js";
import { SAMPLE_COMBATANTS, samplePhase, sampleWheelModel } from "../helpers/sample-combat.js";
import { DEFAULT_VIRTUAL_IMAGE } from "../helpers/virtual-positions.js";
import { combatStyle, getSetting, ownAppearance, savedStyles, setSetting, withLook, withTableLook } from "../hooks/register-settings.js";
import { upsertStyle } from "../helpers/combat-styles.js";
import CoreCombatSettings from "../services/CoreCombatSettings.js";
import ScreenBanner from "../services/ScreenBanner.js";
import CombatStylePicker from "../services/CombatStylePicker.js";
import TurnSideEffects from "../services/TurnSideEffects.js";
import { isVenaerysActive, projectCombat } from "../services/project-combat.js";
import AppearancePreview from "./AppearancePreview.js";
import SettingFieldView from "./SettingFieldView.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const t = (key) => game.i18n.localize(`${I18N_ROOT}.${key}`);
const f = (key, data) => game.i18n.format(`${I18N_ROOT}.${key}`, data);

/** The look this editor edits; it is each user's own (RF-91). */
const ENTRIES = SETTINGS_SCHEMA.filter((entry) => entry.section === "appearance");
const ENTRY_KEYS = new Set(ENTRIES.map((entry) => entry.key));
/** The sounds tab: this browser's, never part of a look, a preset or the table look. */
const SOUND_ENTRIES = SETTINGS_SCHEMA.filter((entry) => entry.section === "sounds");
const SOUNDS_PANEL = "sounds";
/** The sound events in the order a combat plays them, with their icons. */
const SOUND_ROWS = Object.freeze([
  { event: "combatStart", icon: "fa-solid fa-swords" },
  { event: "roundStart", icon: "fa-solid fa-flag" },
  { event: "turnChange", icon: "fa-solid fa-rotate" },
  { event: "nextUp", icon: "fa-solid fa-hourglass-half" },
  { event: "ownTurn", icon: "fa-solid fa-user" },
  { event: "turnBack", icon: "fa-solid fa-rotate-left" },
  { event: "combatEnd", icon: "fa-solid fa-flag-checkered" },
]);
/** RF-111: the module's events Foundry's own combat sound theme also announces (start, next up, your turn). */
const CORE_ANNOUNCED = Object.freeze(["combatStart", "nextUp", "ownTurn"]);
/** What "test in order" plays: a combat as a player hears it. */
const TEST_SEQUENCE = Object.freeze(["combatStart", "nextUp", "ownTurn", "roundStart"]);
const TEST_SEQUENCE_GAP_MS = 1100;
/** The color role each color setting paints, for the preview's highlight (RF-102). */
const COLOR_ROLES = Object.freeze(Object.fromEntries(Object.entries(COLOR_SETTINGS).map(([role, key]) => [key, role])));
const SCOPE_ICONS = Object.freeze({ user: "fa-solid fa-user", client: "fa-solid fa-display" });
/** Sections that open with a line of explanation. */
const PANEL_HINTS = new Set(["visual", "effects", "sounds"]);
const TABLE_LOOK_MODES = Object.freeze(["optional", "forced", "off"]);
/** A few short choices read better as one row of buttons than as a menu: up to this many letters, counting padding. */
const SEGMENTED_BUDGET = 40;
const SEGMENTED_MAX_CHOICES = 4;
/** Room kept around the window when it opens on a small screen. */
const VIEWPORT_MARGIN = 48;

/**
 * The appearance editor (RF-73). The big choices sit on top (view, theme,
 * ready-made looks, the table look); under them the live preview with its
 * turn controls fills the left, and the sections are tabs of the panel on the
 * right. Every change shows in the
 * preview at once and is only written on "Save", which keeps the window open.
 * The look is each user's own; the GM's saved look is also the table look
 * players may follow (RF-91). The sounds tab edits this browser's sounds,
 * heard while the preview turns.
 */
export default class CombatWheelAppearanceApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-appearance`,
    tag: "form",
    classes: [`${MODULE_ID}-settings`, `${MODULE_ID}-appearance`],
    window: { title: `${I18N_ROOT}.Appearance.Title`, icon: "fa-solid fa-palette", resizable: true },
    position: { width: 1360, height: 880 },
    form: { handler: CombatWheelAppearanceApp.#onSubmit, submitOnChange: false, closeOnSubmit: false, submitOnClose: false },
    actions: {
      selectView: CombatWheelAppearanceApp.#onSelectView,
      setPanel: CombatWheelAppearanceApp.#onSetPanel,
      setAdvanced: CombatWheelAppearanceApp.#onSetAdvanced,
      setSource: CombatWheelAppearanceApp.#onSetSource,
      stepTurn: CombatWheelAppearanceApp.#onStepTurn,
      togglePreviewSound: CombatWheelAppearanceApp.#onTogglePreviewSound,
      toggleDetails: CombatWheelAppearanceApp.#onToggleDetails,
      toggleGallery: CombatWheelAppearanceApp.#onToggleGallery,
      toggleThemes: CombatWheelAppearanceApp.#onToggleThemes,
      pickTheme: CombatWheelAppearanceApp.#onPickTheme,
      applyPreset: CombatWheelAppearanceApp.#onApplyPreset,
      applySavedStyle: CombatWheelAppearanceApp.#onApplySavedStyle,
      saveStyle: CombatWheelAppearanceApp.#onSaveStyle,
      deleteSavedStyle: CombatWheelAppearanceApp.#onDeleteSavedStyle,
      useStyleInCombat: CombatWheelAppearanceApp.#onUseStyleInCombat,
      testSound: CombatWheelAppearanceApp.#onTestSound,
      testSequence: CombatWheelAppearanceApp.#onTestSequence,
      previewCoreTheme: CombatWheelAppearanceApp.#onPreviewCoreTheme,
      testBanner: CombatWheelAppearanceApp.#onTestBanner,
      makePalette: CombatWheelAppearanceApp.#onMakePalette,
      resetPanel: CombatWheelAppearanceApp.#onResetPanel,
      closeEditor: CombatWheelAppearanceApp.#onCloseEditor,
    },
  };

  static PARTS = {
    form: { template: `${TEMPLATE_ROOT}/appearance.hbs`, scrollable: [".scw-appearance__fields"] },
  };

  /** Unsaved look values by setting key. */
  #draft = null;
  /** Unsaved sounds of this browser: the module's by setting key, and Foundry's combat sound theme (RF-96). */
  #sounds = null;
  /** The pending steps of "test the sequence", cleared on close: they read `#sounds`. */
  #sequenceTimers = [];
  /** RF-91, unsaved: the GM's table look mode, or whether a player follows the table look. */
  #sharing = null;
  /** RF-108, unsaved (GM): the style combats use by default, and whether starting one asks. */
  #combatStyles = null;
  #saved = false;
  #panel = APPEARANCE_PANELS[0].id;
  /** "sample" turns the made-up encounter; "combat" shows the current one as this user sees it. */
  #source = "sample";
  /** Round 2: before the first turn the wheel draws no past, and the preview would look lopsided. */
  #sampleT = SAMPLE_COMBATANTS.length;
  #expanded = false;
  #galleryOpen = false;
  /** RF-115: the theme gallery, and the theme the pointer (or focus) rests on in it, shown in the preview meanwhile. */
  #themesOpen = false;
  #hoverTheme = null;
  /** Whether turning the sample plays the sound that turn would play. */
  #previewSound = false;
  #preview = null;
  #boundRoot = null;
  #frame = null;

  /** @param {string} [panel]  the tab to show, e.g. "sounds" from the settings screen */
  static open(panel) {
    const app = foundry.applications.instances.get(`${MODULE_ID}-appearance`) ?? new CombatWheelAppearanceApp();
    if (app.rendered) app.#captureDraft();
    if (APPEARANCE_PANELS.some((entry) => entry.id === panel)) app.#panel = panel;
    return app.render({ force: true });
  }

  /** Opens no larger than the screen, so the footer and the preview both show. */
  _initializeApplicationOptions(options) {
    const resolved = super._initializeApplicationOptions(options);
    const position = resolved.position ?? {};
    if (Number.isFinite(position.width)) position.width = Math.min(position.width, window.innerWidth - VIEWPORT_MARGIN);
    if (Number.isFinite(position.height)) position.height = Math.min(position.height, window.innerHeight - VIEWPORT_MARGIN);
    return resolved;
  }

  async _prepareContext() {
    this.#sharing ??= CombatWheelAppearanceApp.#savedSharing();
    this.#draft ??= this.#following() ? withTableLook(ownAppearance()) : ownAppearance();
    this.#sounds ??= CombatWheelAppearanceApp.#savedSounds();
    this.#combatStyles ??= CombatWheelAppearanceApp.#savedCombatStyles();
    const systemId = game.system.id;
    if (this.#source === "combat" && !this.#combatModel()) this.#source = "sample";
    const draft = this.#draft;
    const view = draft[SETTINGS.view];
    const panels = CombatWheelAppearanceApp.#panels();
    if (!panels.some((panel) => panel.id === this.#panel)) this.#panel = panels[0].id;
    const activeScope = panels.find((panel) => panel.id === this.#panel).scope;
    return {
      followSystem: {
        id: FOLLOW_SYSTEM,
        label: t(`Settings.theme.Choices.${FOLLOW_SYSTEM}`),
        selected: draft[SETTINGS.theme] === FOLLOW_SYSTEM,
        swatch: resolveTheme({ chosen: FOLLOW_SYSTEM, systemId }),
      },
      themeId: draft[SETTINGS.theme],
      themeLabel: t(`Settings.theme.Choices.${draft[SETTINGS.theme]}`),
      themesOpen: this.#themesOpen,
      themeGroups: THEME_GROUPS.map((group) => ({
        label: t(`Appearance.ThemeGroups.${group.id}`),
        themes: group.themes.map((id) => ({ id, swatch: id, label: t(`Settings.theme.Choices.${id}`), selected: id === draft[SETTINGS.theme] })),
      })),
      // "Follow the system" shows the theme it would pick here.
      themeSwatch: resolveTheme({ chosen: draft[SETTINGS.theme], systemId }),
      view,
      views: VIEWS.map((id) => ({
        id,
        label: t(`Settings.view.Choices.${id}`),
        hint: t(`Appearance.ViewHints.${id}`),
        active: id === view,
      })),
      following: this.#following(),
      followingNotice: t(this.#locked() ? "Sharing.ForcedNotice" : "Sharing.FollowingNotice"),
      locked: this.#locked(),
      sharing: this.#sharingContext(),
      advanced: CombatWheelAppearanceApp.#advanced(),
      presets: this.#presetsContext(),
      galleryOpen: this.#galleryOpen,
      hasCombat: Boolean(this.#combatModel()),
      source: this.#source,
      expanded: this.#expanded,
      previewSound: this.#previewSound,
      soundsActive: this.#panel === SOUNDS_PANEL,
      scopes: Object.entries(SCOPE_ICONS).map(([id, icon]) => ({
        id,
        icon,
        label: t(`SettingsMenu.Scopes.${id}.Badge`),
        active: id === activeScope,
      })),
      panels: panels.map((panel) => ({
        ...panel,
        label: t(`Appearance.Panels.${panel.id}`),
        hint: PANEL_HINTS.has(panel.id) ? t(`Appearance.PanelHints.${panel.id}`) : "",
        active: panel.id === this.#panel,
        isLayout: panel.id === "layout",
        isVisual: panel.id === "visual",
        isSounds: panel.id === SOUNDS_PANEL,
        groups: panel.id === SOUNDS_PANEL ? [] : CombatWheelAppearanceApp.#groupsOf(panel.id, draft),
      })),
      sounds: this.#soundsContext(),
      styles: this.#stylesContext(),
      combatStyleNotice: this.#combatStyleNotice(),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (this.#boundRoot !== root) {
      this.#boundRoot = root;
      root.addEventListener("input", (event) => this.#onInput(event));
      root.addEventListener("change", (event) => this.#onInput(event));
      root.addEventListener("keydown", (event) => this.#onKeydown(event));
      // RF-102: pointing at (or tabbing to) a color shows in the preview what it paints.
      const point = (event) => this.#preview?.highlight(COLOR_ROLES[event.target.closest?.("[data-setting-row]")?.dataset.settingRow] ?? null);
      root.addEventListener("pointerover", point);
      root.addEventListener("focusin", point);
      root.addEventListener("pointerleave", () => this.#preview?.highlight(null));
      // RF-115: resting on a theme card shows that theme in the preview; leaving the cards shows the chosen one again.
      const hoverTheme = (event) => {
        if (!this.#themesOpen) return;
        const card = event.target.closest?.("[data-theme-card]");
        this.#previewTheme(card ? card.dataset.themeCard : null);
      };
      root.addEventListener("pointerover", hoverTheme);
      root.addEventListener("focusin", hoverTheme);
    }
    this.#preview?.destroy();
    this.#preview = new AppearancePreview(root.querySelector("[data-preview-stage]"), {
      onFit: (shown, wanted) => this.#showZoom(shown, wanted),
    });
    this.#refresh();
  }

  async close(options = {}) {
    if (this.rendered && !options.discardChanges) {
      this.#captureDraft();
      if (this.#isDirty()) {
        const confirmed = await DialogV2.confirm({
          window: { title: t("Appearance.DiscardTitle") },
          content: `<p>${t("Appearance.DiscardText")}</p>`,
          modal: true,
          rejectClose: false,
        });
        if (!confirmed) return this;
      }
    }
    return super.close(options);
  }

  _onClose(options) {
    super._onClose(options);
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#clearSequence();
    this.#preview?.destroy();
    this.#preview = null;
    this.#draft = null;
    this.#sounds = null;
    this.#sharing = null;
    this.#combatStyles = null;
    this.#saved = false;
    this.#galleryOpen = false;
    this.#themesOpen = false;
    this.#hoverTheme = null;
  }

  /* -------------------------------------------- */
  /*  Sharing (RF-91)                             */
  /* -------------------------------------------- */

  static #savedSharing() {
    return { mode: getSetting(SETTINGS.tableLookMode), follow: Boolean(getSetting(SETTINGS.useTableLook)) };
  }

  /** Whether this player's editor shows the table look rather than their own. */
  #following() {
    if (game.user.isGM) return false;
    const { mode, follow } = this.#sharing;
    return mode === "forced" || (mode === "optional" && follow);
  }

  /** The GM requires the table look: a player can look but not change. */
  #locked() {
    return !game.user.isGM && this.#sharing.mode === "forced";
  }

  #sharingContext() {
    const { mode, follow } = this.#sharing;
    if (game.user.isGM) {
      return {
        isGM: true,
        tooltip: `${t("Sharing.Mode.Hint")} ${t("Sharing.Publish")}`,
        modes: TABLE_LOOK_MODES.map((value) => ({ value, label: t(`Sharing.Mode.Choices.${value}`), selected: value === mode })),
      };
    }
    return {
      canChoose: mode === "optional",
      follow,
      notice: t(mode === "forced" ? "Sharing.ForcedNotice" : "Sharing.OffNotice"),
    };
  }

  #sharingDirty() {
    const saved = CombatWheelAppearanceApp.#savedSharing();
    return game.user.isGM ? this.#sharing.mode !== saved.mode : this.#sharing.follow !== saved.follow;
  }

  /* -------------------------------------------- */
  /*  Sections                                    */
  /* -------------------------------------------- */

  /** The tabs this world can use: a module's only while it is active (RF-82). */
  static #panels() {
    return APPEARANCE_PANELS.filter((panel) => !panel.module || game.modules.get(panel.module)?.active);
  }

  /** Whether the user asked to see the fine-tuning rows too; a preference of this browser. */
  static #advanced() {
    return Boolean(getSetting(SETTINGS.editorAdvanced));
  }

  /** A row shows when the other values give it meaning, and fine-tuning only on request. */
  static #rowShown(entry, values) {
    return isSettingShown(entry, values) && (!entry.advanced || CombatWheelAppearanceApp.#advanced());
  }

  /** A few short choices become a row of buttons; long or many stay a menu. */
  static #isSegmented(field) {
    if (!field.isChoice || field.choices.length > SEGMENTED_MAX_CHOICES) return false;
    const letters = field.choices.reduce((sum, choice) => sum + choice.label.length + 4, 0);
    return letters <= SEGMENTED_BUDGET;
  }

  /** A section's rows under their small headings, groups in order of first appearance (RF-99). */
  static #groupsOf(panelId, draft) {
    const groups = new Map();
    for (const entry of ENTRIES.filter((candidate) => candidate.panel === panelId)) {
      const id = entry.group ?? panelId;
      if (!groups.has(id)) groups.set(id, { id, label: t(`Appearance.Groups.${id}`), fields: [] });
      const field = SettingFieldView.of(entry, draft[entry.key]);
      groups.get(id).fields.push({
        ...field,
        segmented: CombatWheelAppearanceApp.#isSegmented(field),
        stacked: field.isNumber || field.isChoice,
        shown: CombatWheelAppearanceApp.#rowShown(entry, draft),
      });
    }
    return [...groups.values()];
  }

  /* -------------------------------------------- */
  /*  Ready-made looks (RF-97)                    */
  /* -------------------------------------------- */

  /** A preset over the defaults: what applying it gives, whatever is on screen now. */
  static #presetValues(preset) {
    const values = Object.fromEntries(ENTRIES.map((entry) => [entry.key, settingDefault(entry)]));
    for (const [key, value] of Object.entries(preset.values)) {
      const entry = ENTRIES.find((candidate) => candidate.key === key);
      const coerced = entry ? coerceSetting(entry, value) : null;
      if (coerced !== null) values[key] = coerced;
    }
    return values;
  }

  static #presetMatches(preset, values) {
    return Object.entries(preset.values).every(([key, value]) => values[key] === value);
  }

  /** The gallery's cards; the one the draft matches is marked. */
  #presetsContext() {
    return APPEARANCE_PRESETS.map((preset) => ({
      id: preset.id,
      icon: preset.icon,
      swatch: preset.swatch,
      view: t(`Settings.view.Choices.${preset.values.view ?? settingDefault(ENTRIES.find((entry) => entry.key === SETTINGS.view))}`),
      label: t(`Presets.${preset.id}.Name`),
      hint: t(`Presets.${preset.id}.Hint`),
      active: CombatWheelAppearanceApp.#presetMatches(preset, this.#draft),
    }));
  }

  /* -------------------------------------------- */
  /*  Combat styles (RF-108)                      */
  /* -------------------------------------------- */

  static #savedCombatStyles() {
    return { defaultId: getSetting(SETTINGS.combatStyleDefault) ?? "", prompt: Boolean(getSetting(SETTINGS.combatStylePrompt)) };
  }

  #combatStylesDirty() {
    if (!game.user.isGM || !this.#combatStyles) return false;
    const saved = CombatWheelAppearanceApp.#savedCombatStyles();
    return this.#combatStyles.defaultId !== saved.defaultId || this.#combatStyles.prompt !== saved.prompt;
  }

  /** The table's saved styles as gallery cards; the GM also gets the combat defaults. */
  #stylesContext() {
    const systemId = game.system.id;
    const { defaultId, prompt } = this.#combatStyles;
    const styles = savedStyles();
    const inCombat = combatStyle()?.id ?? null;
    return {
      isGM: game.user.isGM,
      // RF-110: with a combat on, the GM can give it any style straight from here.
      canUseInCombat: game.user.isGM && Boolean(game.combat),
      useLabel: t("CombatStyles.UseInCombat"),
      prompt,
      deleteLabel: t("CombatStyles.Delete"),
      defaults: [{ id: "", name: t("CombatStyles.Usual") }, ...styles].map((style) => ({
        value: style.id,
        label: style.name,
        selected: style.id === defaultId,
      })),
      list: styles.map((style) => ({
        id: style.id,
        name: style.name,
        swatch: resolveTheme({ chosen: style.values.theme, systemId }),
        view: t(`Settings.view.Choices.${VIEWS.includes(style.values.view) ? style.values.view : VIEWS[0]}`),
        isDefault: style.id === defaultId,
        inCombat: style.id === inCombat,
      })),
    };
  }

  /** While the current combat has a style, the editor says that what it edits is the usual look. */
  #combatStyleNotice() {
    const style = combatStyle();
    if (!style || !(game.user.isGM || this.#following())) return "";
    return f("CombatStyles.ActiveNotice", { name: style.name });
  }

  /* -------------------------------------------- */
  /*  Sounds (RF-50 to RF-54, RF-96)              */
  /* -------------------------------------------- */

  static #savedSounds() {
    return {
      values: Object.fromEntries(SOUND_ENTRIES.map((entry) => [entry.key, getSetting(entry.key)])),
      coreTheme: game.settings.get("core", "combatTheme"),
    };
  }

  #soundsContext() {
    const values = this.#sounds.values;
    const view = (entry) => ({ ...SettingFieldView.of(entry, values[entry.key]), shown: isSettingShown(entry, values) });
    return {
      allowed: Boolean(getSetting(SETTINGS.soundsAllowed)),
      volume: view(SOUND_ENTRIES.find((entry) => entry.key === SETTINGS.soundVolume)),
      coreTheme: CoreCombatSettings.themeField(this.#sounds.coreTheme),
      events: SOUND_ROWS.map(({ event, icon }) => ({
        icon,
        label: t(`Appearance.SoundEvents.${event}`),
        field: view(SOUND_ENTRIES.find((entry) => entry.sound === event)),
        file: view(SOUND_ENTRIES.find((entry) => entry.fileFor === event)),
      })),
    };
  }

  #dirtySoundKeys() {
    if (!this.#sounds) return [];
    return SOUND_ENTRIES.filter((entry) => this.#sounds.values[entry.key] !== getSetting(entry.key)).map((entry) => entry.key);
  }

  #soundsDirty() {
    if (!this.#sounds) return false;
    return this.#dirtySoundKeys().length > 0 || this.#sounds.coreTheme !== game.settings.get("core", "combatTheme");
  }

  /** Plays `event` as the form says now, saved or not; resolves whether anything played. */
  #playSoundEvent(event) {
    const entry = SOUND_ENTRIES.find((candidate) => candidate.sound === event);
    const file = SOUND_ENTRIES.find((candidate) => candidate.fileFor === event);
    if (!entry || !this.#sounds) return Promise.resolve(false);
    const values = this.#sounds.values;
    return TurnSideEffects.playEvent(event, {
      choice: values[entry.key],
      file: file ? values[file.key] : "",
      volume: values[SETTINGS.soundVolume],
    });
  }

  /* -------------------------------------------- */
  /*  Draft and live state                        */
  /* -------------------------------------------- */

  /** Shows or hides the fine-tuning rows at once, and remembers the choice for next time. */
  async #setAdvanced(advanced) {
    await setSetting(SETTINGS.editorAdvanced, advanced);
    this.#scheduleRefresh();
  }

  #captureDraft() {
    if (!this.element || !this.#draft) return;
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    for (const entry of ENTRIES) {
      let raw = data[entry.key];
      // A list setting comes as one checkbox per choice; a cleared box puts the choice on the list.
      if (entry.type === "multi") {
        if (!entry.choices.some((choice) => `${entry.key}.${choice}` in data)) continue;
        raw = entry.choices.filter((choice) => data[`${entry.key}.${choice}`] === false);
      } else if (!(entry.key in data)) continue;
      const value = coerceSetting(entry, raw);
      if (value !== null) this.#draft[entry.key] = value;
    }
    for (const entry of SOUND_ENTRIES) {
      if (!(entry.key in data)) continue;
      const value = coerceSetting(entry, data[entry.key]);
      if (value !== null) this.#sounds.values[entry.key] = value;
    }
    if (typeof data.coreCombatTheme === "string") this.#sounds.coreTheme = data.coreCombatTheme;
    if (game.user.isGM && TABLE_LOOK_MODES.includes(data.tableLookMode)) this.#sharing.mode = data.tableLookMode;
    if (game.user.isGM && typeof data.combatStyleDefault === "string") {
      this.#combatStyles.defaultId = data.combatStyleDefault;
      this.#combatStyles.prompt = Boolean(data.combatStylePrompt);
    }
  }

  /** Own look values that differ from the saved ones; a follower keeps none of their own. */
  #dirtyKeys() {
    if (!this.#draft || this.#following()) return [];
    return ENTRIES.filter((entry) => !CombatWheelAppearanceApp.#sameValue(this.#draft[entry.key], getSetting(entry.key))).map((entry) => entry.key);
  }

  /** A list setting is rebuilt from its checkboxes on every read: same items, same value. */
  static #sameValue(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item) => b.includes(item));
    return a === b;
  }

  #isDirty() {
    if (!this.#draft) return false;
    return this.#sharingDirty() || this.#dirtyKeys().length > 0 || this.#soundsDirty() || this.#combatStylesDirty();
  }

  /** The current combat as this user may see it, or null when it shows nobody. */
  #combatModel() {
    const model = projectCombat(game.combat);
    return model?.N ? model : null;
  }

  #previewModel() {
    if (this.#source === "combat") {
      const model = this.#combatModel();
      if (model) return model;
    }
    return this.#sampleModel();
  }

  #sampleModel() {
    return sampleWheelModel({ T: this.#sampleT, names: CombatWheelAppearanceApp.#sampleNames() });
  }

  static #sampleNames() {
    return Object.fromEntries(SAMPLE_COMBATANTS.map(({ key }) => [key, t(`Appearance.Names.${key}`)]));
  }

  /** With Venaerys active, the sample also shows a phase strip, so its options can be seen (RF-82). */
  #previewPhase(model) {
    if (!isVenaerysActive() || model.phased) return null;
    return samplePhase({ ...CombatWheelAppearanceApp.#sampleNames(), phase: t("Appearance.SamplePhase") });
  }

  /**
   * Keeps color pickers and their hex fields together, turns a follower's first
   * edit into their own look, and lets the preview catch up once per frame
   * (range sliders fire on every pixel).
   */
  #onInput(event) {
    const target = event.target;
    const color = target.dataset?.colorPicker ?? target.dataset?.colorText ?? target.dataset?.colorToggle;
    if (color) this.#syncColor(color, target);
    if (target.matches?.("[data-follow-toggle]") && event.type === "change") return this.#setFollow(target.checked);
    const name = target.name?.split(".")[0] || color;
    if (ENTRY_KEYS.has(name) && this.#following() && !this.#locked()) this.#setFollow(false, { render: false });
    this.#scheduleRefresh();
  }

  /** Escape closes the gallery before it closes the window; arrows walk the tabs, as in any tab list. */
  #onKeydown(event) {
    if (event.key === "Escape" && (this.#galleryOpen || this.#themesOpen)) {
      event.preventDefault();
      event.stopPropagation();
      if (this.#themesOpen) this.#setThemes(false);
      else this.#setGallery(false);
      return;
    }
    const tab = event.target.closest?.('[role="tab"]');
    if (!tab) return;
    const tabs = [...this.element.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(tab);
    const moves = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    next.focus();
    this.#selectPanel(next.dataset.panel);
  }

  /**
   * A color row is its checkbox, hex and picker: the box on takes the picker's
   * color, off goes back to the theme's (empty), and picking or typing a color
   * turns the box on.
   */
  #syncColor(key, source) {
    const root = this.element;
    const text = root.querySelector(`[data-color-text="${key}"]`);
    const picker = root.querySelector(`[data-color-picker="${key}"]`);
    const toggle = root.querySelector(`[data-color-toggle="${key}"]`);
    if (!text || !picker || !toggle) return;
    if (source === toggle) text.value = toggle.checked ? picker.value : "";
    else if (source === picker) text.value = picker.value;
    else if (isHexColor(text.value)) picker.value = text.value;
    toggle.checked = isHexColor(text.value);
  }

  /** Following starts from the table look again; leaving it keeps what is on screen as one's own start. */
  #setFollow(follow, { render = true } = {}) {
    this.#sharing.follow = follow;
    const toggle = this.element.querySelector("[data-follow-toggle]");
    if (toggle) toggle.checked = follow;
    this.element.querySelector("[data-following-notice]")?.toggleAttribute("hidden", !this.#following());
    if (follow) this.#draft = withTableLook(ownAppearance());
    if (render && follow) return this.render();
    this.#scheduleRefresh();
  }

  /** RF-115: one gallery at a time over the preview. */
  #setThemes(open) {
    this.#themesOpen = open;
    if (open && this.#galleryOpen) this.#setGallery(false, { focus: false });
    if (!open) this.#hoverTheme = null;
    const root = this.element;
    root.querySelector("[data-theme-gallery]")?.toggleAttribute("hidden", !open);
    const button = root.querySelector(".scw-appearance__theme-btn");
    button?.classList.toggle("is-active", open);
    button?.setAttribute("aria-expanded", String(open));
    if (open) (root.querySelector("[data-theme-gallery] .scw-theme-card.is-active") ?? root.querySelector("[data-theme-gallery] .scw-theme-card"))?.focus();
    else button?.focus();
    this.#scheduleRefresh();
  }

  /** The theme a card shows while the pointer or focus rests on it; null puts the chosen one back. */
  #previewTheme(id) {
    if (!this.#themesOpen || this.#hoverTheme === id) return;
    this.#hoverTheme = id;
    this.#scheduleRefresh();
  }

  #setGallery(open, { focus = true } = {}) {
    if (open && this.#themesOpen) this.#setThemes(false);
    this.#galleryOpen = open;
    const root = this.element;
    root.querySelector("[data-gallery]")?.toggleAttribute("hidden", !open);
    const button = root.querySelector(".scw-appearance__presets-btn");
    button?.classList.toggle("is-active", open);
    button?.setAttribute("aria-expanded", String(open));
    if (!focus) return;
    if (open) root.querySelector("[data-gallery] .scw-preset")?.focus();
    else button?.focus();
  }

  /** Switches the tab in place; a re-render would rebuild the preview. */
  #selectPanel(id) {
    const panel = CombatWheelAppearanceApp.#panels().find((candidate) => candidate.id === id);
    if (!panel) return;
    this.#panel = id;
    const root = this.element;
    for (const element of root.querySelectorAll("[data-field-panel]")) element.hidden = element.dataset.fieldPanel !== id;
    for (const tab of root.querySelectorAll('[role="tab"]')) {
      const active = tab.dataset.panel === id;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const badge of root.querySelectorAll("[data-scope-badge]")) badge.hidden = badge.dataset.scopeBadge !== panel.scope;
    root.querySelector("[data-advanced-group]")?.toggleAttribute("hidden", id === SOUNDS_PANEL);
  }

  #scheduleRefresh() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#refresh();
    });
  }

  #refresh() {
    const root = this.element;
    if (!root || !this.#draft) return;
    this.#captureDraft();
    const values = this.#draft;

    const advanced = CombatWheelAppearanceApp.#advanced();
    for (const entry of ENTRIES) {
      const shown = CombatWheelAppearanceApp.#rowShown(entry, values);
      for (const row of root.querySelectorAll(`[data-setting-row="${entry.key}"]`)) row.hidden = !shown;
    }
    for (const entry of SOUND_ENTRIES.filter((candidate) => candidate.visibleWhen)) {
      const row = root.querySelector(`[data-setting-row="${entry.key}"]`);
      if (row) row.hidden = !isSettingShown(entry, this.#sounds.values);
    }
    this.#showSoundOverlap();
    // A heading over nothing goes too.
    for (const group of root.querySelectorAll("[data-field-group]")) {
      group.hidden = !group.querySelector("[data-setting-row]:not([hidden])");
    }
    // Under a section with fine-tuning out of sight, a way to bring it back.
    for (const note of root.querySelectorAll("[data-more-note]")) {
      const panel = note.dataset.moreNote;
      note.hidden = advanced || !ENTRIES.some((entry) => entry.panel === panel && entry.advanced && isSettingShown(entry, values));
    }
    CombatWheelAppearanceApp.#press(root.querySelectorAll('[data-action="setAdvanced"]'), (button) => button.dataset.advanced === String(advanced));
    for (const card of root.querySelectorAll("[data-preset]")) {
      const preset = APPEARANCE_PRESETS.find((candidate) => candidate.id === card.dataset.preset);
      const active = Boolean(preset) && CombatWheelAppearanceApp.#presetMatches(preset, values);
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-pressed", String(active));
    }
    this.#showRatioWarning(values);

    const theme = resolveTheme({ chosen: values[SETTINGS.theme], systemId: game.system.id });
    const swatch = root.querySelector("[data-theme-swatch]");
    if (swatch) swatch.dataset.scwTheme = theme;
    // While a theme card is pointed at, the preview wears that theme.
    const shownTheme = this.#hoverTheme ? resolveTheme({ chosen: this.#hoverTheme, systemId: game.system.id }) : theme;
    // The details toggle only means something while the bar offers its details (RF-83, RF-111); a split bar has none (RF-104).
    const offersDetails = !(values[SETTINGS.barHidden] ?? []).includes("details") && values[SETTINGS.barLayout] !== "split";
    const details = root.querySelector("[data-details-toggle]");
    if (details) details.hidden = !offersDetails;
    const model = this.#previewModel();
    this.#showTurn(model);
    this.#preview?.update({
      values: this.#hoverTheme ? { ...values, [SETTINGS.theme]: this.#hoverTheme } : values,
      theme: shownTheme,
      model,
      expanded: this.#expanded && offersDetails,
      phase: this.#previewPhase(model),
    });
    this.#showContrast();
    this.#syncStatus();
  }

  /**
   * RF-115: a word when the text, or the accent, would be hard to read on the
   * panels — measured on the colours the preview actually draws (WCAG 4.5:1
   * for text, 3:1 for the accent's icons and edges).
   */
  #showContrast() {
    const warning = this.element.querySelector("[data-contrast-warning]");
    const colors = this.#preview?.resolvedColors();
    if (!warning || !colors) return;
    const surface = parseCssColor(colors.surface);
    const text = parseCssColor(colors.text);
    const accent = parseCssColor(colors.accent);
    if (!surface || !text || !accent) return void (warning.hidden = true);
    const textRatio = contrastRatio(text, surface);
    const accentRatio = contrastRatio(accent, surface);
    const problems = [];
    if (textRatio < 4.5) problems.push(f("Appearance.ContrastText", { ratio: textRatio.toFixed(1) }));
    if (accentRatio < 3) problems.push(f("Appearance.ContrastAccent", { ratio: accentRatio.toFixed(1) }));
    warning.hidden = problems.length === 0;
    warning.lastElementChild.textContent = problems.length ? `${problems.join(" ")} ${t("Appearance.ContrastFix")}` : "";
  }

  /** SPEC §6: custom slices past 1.4:1 stretch portraits; say so right under the radii. */
  #showRatioWarning(values) {
    const warning = this.element.querySelector("[data-ratio-warning]");
    if (!warning) return;
    const preset = presetFromSettings(values);
    const bad = values[SETTINGS.view] === "wheel" && values[SETTINGS.layoutPreset] === "custom" && !isPortraitRatioOk(preset);
    warning.hidden = !bad;
    warning.lastElementChild.textContent = bad ? f("Notifications.PortraitRatio", { ratio: portraitRatio(preset).toFixed(2) }) : "";
  }

  #showZoom(shown, wanted) {
    const note = this.element?.querySelector("[data-preview-zoom]");
    if (!note) return;
    const zoomed = shown < wanted - 0.005;
    note.hidden = !zoomed;
    note.textContent = zoomed ? f("Appearance.Zoomed", { percent: Math.round(shown * 100) }) : "";
  }

  /**
   * RF-111: Foundry's combat sound theme announces the start, who is next and
   * whose turn it is; with the wheel's sounds for those on too, both play.
   */
  #showSoundOverlap() {
    const notice = this.element.querySelector("[data-sound-overlap]");
    if (!notice) return;
    const themeSelect = this.element.querySelector('[name="coreCombatTheme"]');
    const overlapping = CORE_ANNOUNCED.filter((event) => {
      const entry = SOUND_ENTRIES.find((candidate) => candidate.sound === event);
      return entry && this.#sounds.values[entry.key] !== "off";
    });
    const show = this.#sounds.coreTheme !== "none" && overlapping.length > 0;
    notice.hidden = !show;
    if (!show) return;
    notice.lastElementChild.textContent = f("Appearance.SoundOverlap", {
      theme: themeSelect?.selectedOptions[0]?.textContent ?? this.#sounds.coreTheme,
      events: overlapping.map((event) => t(`Appearance.SoundEvents.${event}`)).join(", "),
    });
  }

  /** The round and turn the preview shows, and who acts, unless this user may not know. */
  #showTurn(model) {
    const label = this.element.querySelector("[data-preview-turn]");
    if (!label) return;
    const turn = f("Appearance.TurnLabel", { round: model.round, turn: model.turnLabel });
    const name = model.activeHidden ? "" : model.current?.name ?? "";
    label.replaceChildren(turn);
    if (name) {
      const strong = document.createElement("strong");
      strong.textContent = name;
      label.append(" · ", strong);
    }
  }

  #syncStatus() {
    const root = this.element;
    const dirty = new Set(this.#dirtyKeys());
    const isDirty = this.#isDirty();
    if (isDirty) this.#saved = false;
    const sharingDirty = this.#sharingDirty();
    const soundsDirty = this.#soundsDirty();
    for (const dot of root.querySelectorAll("[data-panel-dot]")) {
      const panel = dot.dataset.panelDot;
      if (panel === "sharing") dot.hidden = !sharingDirty;
      else if (panel === SOUNDS_PANEL) dot.hidden = !soundsDirty;
      else dot.hidden = !ENTRIES.some((entry) => entry.panel === panel && dirty.has(entry.key));
    }
    root.querySelector("[data-save-button]")?.classList.toggle("is-dirty", isDirty);

    const pill = root.querySelector("[data-status-pill]");
    const label = root.querySelector("[data-status-pill-label]");
    if (!pill || !label) return;
    pill.classList.toggle("scw-config-pill--unsaved", isDirty);
    pill.classList.toggle("scw-config-pill--saved", !isDirty && this.#saved);
    pill.hidden = !isDirty && !this.#saved;
    label.textContent = isDirty ? t("SettingsMenu.Unsaved") : this.#saved ? t("SettingsMenu.Saved") : "";
  }

  /** Marks the one pressed button of a group, the way a segmented control reads. */
  static #press(buttons, isActive, attribute = "aria-pressed") {
    for (const button of buttons) {
      const active = isActive(button);
      button.classList.toggle("is-active", active);
      button.setAttribute(attribute, String(active));
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSelectView(event, target) {
    const view = target.dataset.view;
    const input = this.element.querySelector(`[name="${SETTINGS.view}"]`);
    if (!input || !VIEWS.includes(view) || this.#locked()) return;
    input.value = view;
    CombatWheelAppearanceApp.#press(this.element.querySelectorAll('[data-action="selectView"]'), (button) => button === target, "aria-checked");
    if (this.#following()) this.#setFollow(false, { render: false });
    this.#refresh();
  }

  static #onSetPanel(event, target) {
    this.#selectPanel(target.dataset.panel);
  }

  static #onSetAdvanced(event, target) {
    void this.#setAdvanced(target.dataset.advanced === "true");
  }

  static #onSetSource(event, target) {
    this.#source = target.dataset.source === "combat" ? "combat" : "sample";
    CombatWheelAppearanceApp.#press(this.element.querySelectorAll('[data-action="setSource"]'), (button) => button === target);
    for (const button of this.element.querySelectorAll('[data-action="stepTurn"]')) button.disabled = this.#source === "combat";
    this.#refresh();
  }

  /**
   * Turns the sample wheel, so the motion settings can be seen (never the real
   * combat), and plays the sound that turn would play when asked to.
   */
  static #onStepTurn(event, target) {
    if (this.#source !== "sample") return;
    const before = this.#sampleModel();
    this.#sampleT = Math.max(0, this.#sampleT + Number(target.dataset.step));
    if (this.#previewSound) {
      this.#captureDraft();
      const turnBack = this.#sounds.values[SETTINGS.soundTurnBack] !== "off";
      const sound = soundEventFor(before, this.#sampleModel(), { isGM: game.user.isGM, turnBack });
      if (sound) void this.#playSoundEvent(sound);
    }
    this.#refresh();
  }

  static #onTogglePreviewSound(event, target) {
    this.#previewSound = !this.#previewSound;
    target.classList.toggle("is-active", this.#previewSound);
    target.setAttribute("aria-pressed", String(this.#previewSound));
    const icon = target.querySelector("i");
    icon?.classList.toggle("fa-volume-high", this.#previewSound);
    icon?.classList.toggle("fa-volume-xmark", !this.#previewSound);
  }

  static #onToggleDetails(event, target) {
    this.#expanded = !this.#expanded;
    target.classList.toggle("is-active", this.#expanded);
    target.setAttribute("aria-pressed", String(this.#expanded));
    this.#refresh();
  }

  static #onToggleGallery() {
    this.#setGallery(!this.#galleryOpen);
  }

  static #onToggleThemes() {
    this.#setThemes(!this.#themesOpen);
  }

  /** RF-115: takes the card's theme into the draft and closes the gallery; "Save" still decides. */
  static #onPickTheme(event, target) {
    const id = target.dataset.themeCard;
    const input = this.element.querySelector(`[name="${SETTINGS.theme}"]`);
    if (!input || !id || this.#locked()) return;
    input.value = id;
    const name = this.element.querySelector("[data-theme-name]");
    if (name) name.textContent = t(`Settings.theme.Choices.${id}`);
    CombatWheelAppearanceApp.#press(this.element.querySelectorAll("[data-theme-card]"), (card) => card.dataset.themeCard === id);
    if (this.#following()) this.#setFollow(false, { render: false });
    this.#setThemes(false);
  }

  /** RF-97: a whole look at once, in the draft only; "Save" still decides. Sounds stay as they are. */
  static #onApplyPreset(event, target) {
    const preset = APPEARANCE_PRESETS.find((candidate) => candidate.id === target.dataset.preset);
    if (!preset || this.#locked()) return;
    this.#captureDraft();
    this.#draft = CombatWheelAppearanceApp.#presetValues(preset);
    if (!game.user.isGM) this.#sharing.follow = false;
    this.#galleryOpen = false;
    this.render();
  }

  /** RF-108: a saved style as the draft, over the defaults; "Save" still decides. */
  static #onApplySavedStyle(event, target) {
    const style = savedStyles().find((candidate) => candidate.id === target.dataset.styleId);
    if (!style || this.#locked()) return;
    this.#captureDraft();
    const defaults = Object.fromEntries(ENTRIES.map((entry) => [entry.key, settingDefault(entry)]));
    this.#draft = withLook(defaults, style.values);
    if (!game.user.isGM) this.#sharing.follow = false;
    this.#galleryOpen = false;
    this.render();
  }

  /** Saves what is on screen (the draft) as a named style of the table; the same name replaces it. Written at once. */
  static async #onSaveStyle() {
    if (!game.user.isGM) return;
    this.#captureDraft();
    const name = await DialogV2.prompt({
      window: { title: t("CombatStyles.SaveTitle"), icon: "fa-solid fa-floppy-disk" },
      content: `<label>${t("CombatStyles.Name")}<input type="text" name="name" maxlength="60" required autofocus></label>`,
      ok: { label: t("CombatStyles.Save"), callback: (event, button) => button.form.elements.name.value },
      rejectClose: false,
    });
    if (!name?.trim()) return;
    const styles = upsertStyle(savedStyles(), { name, values: { ...this.#draft } }, foundry.utils.randomID());
    await setSetting(SETTINGS.savedStyles, styles);
    ui.notifications.info(f("CombatStyles.Saved", { name: name.trim() }));
    this.render();
  }

  /** RF-110: the current combat takes this style for the whole table, at once (not part of the draft). */
  static async #onUseStyleInCombat(event, target) {
    if (!game.user.isGM || !game.combat) return;
    this.#captureDraft();
    await CombatStylePicker.apply(game.combat, target.dataset.styleId);
    this.render();
  }

  static async #onDeleteSavedStyle(event, target) {
    if (!game.user.isGM) return;
    const style = savedStyles().find((candidate) => candidate.id === target.dataset.styleId);
    if (!style) return;
    const confirmed = await DialogV2.confirm({
      window: { title: t("CombatStyles.Delete") },
      content: `<p>${f("CombatStyles.DeleteText", { name: foundry.utils.escapeHTML(style.name) })}</p>`,
      rejectClose: false,
    });
    if (!confirmed) return;
    this.#captureDraft();
    await setSetting(SETTINGS.savedStyles, savedStyles().filter((candidate) => candidate.id !== style.id));
    if (this.#combatStyles.defaultId === style.id) this.#combatStyles.defaultId = "";
    this.render();
  }

  static #onTestSound(event, target) {
    this.#captureDraft();
    this.#playSoundEvent(target.dataset.sound).then((played) => {
      if (!played) ui.notifications.info(`${I18N_ROOT}.Notifications.SoundSilent`, { localize: true });
    });
  }

  /** Plays a combat's sounds one after another, as a player would hear them; silent ones are skipped. */
  static #onTestSequence() {
    this.#captureDraft();
    const events = TEST_SEQUENCE.filter((event) => {
      const entry = SOUND_ENTRIES.find((candidate) => candidate.sound === event);
      return entry && this.#sounds.values[entry.key] !== "off";
    });
    if (!events.length) {
      ui.notifications.info(`${I18N_ROOT}.Notifications.SoundSilent`, { localize: true });
      return;
    }
    this.#clearSequence();
    this.#sequenceTimers = events.map((event, index) => setTimeout(() => void this.#playSoundEvent(event), index * TEST_SEQUENCE_GAP_MS));
  }

  #clearSequence() {
    for (const timer of this.#sequenceTimers) clearTimeout(timer);
    this.#sequenceTimers = [];
  }

  /** Plays what the form currently says, saved or not. */
  static #onPreviewCoreTheme() {
    CoreCombatSettings.preview(this.element.querySelector('[name="coreCombatTheme"]')?.value);
  }

  /** RF-115: fills the four main colour rows from one colour; they stay editable, and "Save" still decides. */
  static #onMakePalette() {
    if (this.#locked()) return;
    const root = this.element;
    const seed = root.querySelector("[data-palette-seed]")?.value;
    const mode = root.querySelector('[name="scwPaletteMode"]:checked')?.value ?? "dark";
    const palette = paletteFromColor(seed, mode);
    if (!palette) return;
    const rows = { [SETTINGS.colorAccent]: palette.accent, [SETTINGS.colorBackground]: palette.background, [SETTINGS.colorSurface]: palette.surface, [SETTINGS.colorText]: palette.text };
    for (const [key, hex] of Object.entries(rows)) {
      const text = root.querySelector(`[data-color-text="${key}"]`);
      if (!text) continue;
      text.value = hex;
      this.#syncColor(key, text);
    }
    if (this.#following()) this.#setFollow(false, { render: false });
    this.#scheduleRefresh();
  }

  /** RF-106: a virtual position's message as the draft would draw it, with the default picture of one. */
  static #onTestBanner() {
    this.#captureDraft();
    ScreenBanner.show({
      title: t("Appearance.SampleBannerTitle"),
      text: t("Appearance.SampleBannerText"),
      seconds: 4,
      img: DEFAULT_VIRTUAL_IMAGE,
    }, this.#draft, { preview: true });
  }

  /** The visible tab back to its defaults, in the draft only: "Save" still decides. */
  static #onResetPanel() {
    this.#captureDraft();
    if (this.#panel === SOUNDS_PANEL) {
      for (const entry of SOUND_ENTRIES) this.#sounds.values[entry.key] = settingDefault(entry);
      return this.render();
    }
    if (this.#locked()) return;
    for (const entry of ENTRIES.filter((candidate) => candidate.panel === this.#panel)) this.#draft[entry.key] = settingDefault(entry);
    if (!game.user.isGM) this.#sharing.follow = false;
    this.render();
  }

  static #onCloseEditor() {
    return this.close();
  }

  /**
   * A follower saves only that they follow; anyone else saves their own look.
   * The GM's saved look is also published as the table look (RF-91). Sounds are
   * this browser's and are saved apart from any look.
   */
  static async #onSubmit() {
    this.#captureDraft();
    const writes = this.#dirtyKeys().map((key) => setSetting(key, this.#draft[key]));
    writes.push(...this.#dirtySoundKeys().map((key) => setSetting(key, this.#sounds.values[key])));
    writes.push(CoreCombatSettings.save({ theme: this.#sounds.coreTheme }));
    const saved = CombatWheelAppearanceApp.#savedSharing();
    if (game.user.isGM) {
      const styles = this.#combatStyles;
      if (styles.defaultId !== getSetting(SETTINGS.combatStyleDefault)) writes.push(setSetting(SETTINGS.combatStyleDefault, styles.defaultId));
      if (styles.prompt !== getSetting(SETTINGS.combatStylePrompt)) writes.push(setSetting(SETTINGS.combatStylePrompt, styles.prompt));
      if (this.#sharing.mode !== saved.mode) writes.push(setSetting(SETTINGS.tableLookMode, this.#sharing.mode));
      writes.push(setSetting(SETTINGS.tableLook, { ...this.#draft }));
    } else if (this.#sharing.follow !== saved.follow) {
      writes.push(setSetting(SETTINGS.useTableLook, this.#sharing.follow));
    }
    await Promise.all(writes);
    this.#saved = true;
    // RF-72: saving always answers.
    ui.notifications.info(`${I18N_ROOT}.Notifications.AppearanceSaved`, { localize: true });
    this.#syncStatus();
  }
}
