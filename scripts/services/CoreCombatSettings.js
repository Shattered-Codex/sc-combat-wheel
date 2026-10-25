/**
 * Foundry's own combat settings (RF-96), edited from the module's windows so
 * everything about combat sits in one place: the sound theme per browser
 * (`core.combatTheme`) with the wheel's sounds in the appearance editor, the
 * rest for the world (`core.combatTrackerConfig`, GM only) in the settings
 * screen. Nothing is copied: the values are read from and written to the core
 * settings, exactly as the core's Combat Tracker Settings window does. Turn
 * markers came with Foundry v13; anything missing is left out.
 */
export default class CoreCombatSettings {
  /** The core's combat sound theme, as select data. */
  static themeField(value = game.settings.get("core", "combatTheme")) {
    const themes = Object.entries(CONFIG.Combat.sounds ?? {}).map(([id, theme]) => ({ value: id, label: game.i18n.localize(theme.label) }));
    const choices = [{ value: "none", label: game.i18n.localize("SC_COMBAT_WHEEL.CoreCombat.NoTheme") }, ...themes];
    return { value, choices: choices.map((choice) => ({ ...choice, selected: choice.value === value })) };
  }

  /** The world's tracker settings, or null when this user may not change them. */
  static trackerValues() {
    if (!game.user.can("SETTINGS_MODIFY")) return null;
    const config = game.settings.get("core", "combatTrackerConfig") ?? {};
    const marker = config.turnMarker ?? {};
    return {
      resource: config.resource ?? "",
      skipDefeated: Boolean(config.skipDefeated),
      markerEnabled: marker.enabled !== false,
      markerAnimation: marker.animation ?? "spin",
      markerSrc: marker.src ?? "",
      markerDisposition: Boolean(marker.disposition),
    };
  }

  /** Template data for the tracker settings from `values` (see trackerValues). */
  static trackerFields(values) {
    if (!values) return null;
    const TokenDocument = foundry.utils.getDocumentClass("Token");
    const attributes = TokenDocument.getTrackedAttributes();
    attributes.bar.forEach((path) => path.push("value"));
    const groups = new Map();
    for (const choice of TokenDocument.getTrackedAttributeChoices(attributes)) {
      if (!groups.has(choice.group)) groups.set(choice.group, []);
      groups.get(choice.group).push({ ...choice, selected: choice.value === values.resource });
    }
    const animations = CONFIG.Combat.settings?.turnMarkerAnimations ?? [];
    return {
      ...values,
      hasMarkers: Boolean(CONFIG.Combat.settings),
      resourceGroups: [...groups].map(([label, choices]) => ({ label, choices })),
      animations: animations.map(({ value, label }) => ({ value, label: game.i18n.localize(label), selected: value === values.markerAnimation })),
    };
  }

  /**
   * Reads the screen's `core` form data back into the shape of trackerValues.
   * The marker's own fields are disabled while markers are off, and so absent
   * from the form: they keep `fallback`'s values.
   */
  static trackerFromForm(core, fallback = null) {
    const tracker = core?.tracker;
    if (!tracker) return null;
    const keep = (key, value) => (value === undefined ? fallback?.[key] : value);
    return {
      resource: String(tracker.resource ?? ""),
      skipDefeated: Boolean(tracker.skipDefeated),
      markerEnabled: Boolean(tracker.markerEnabled),
      markerAnimation: String(keep("markerAnimation", tracker.markerAnimation) ?? "spin"),
      markerSrc: String(keep("markerSrc", tracker.markerSrc) ?? ""),
      markerDisposition: Boolean(keep("markerDisposition", tracker.markerDisposition)),
    };
  }

  static #previewIndex = 0;

  /** Plays the theme's sounds in turn, one per press, as the core window's preview does. */
  static preview(themeId) {
    const theme = CONFIG.Combat.sounds?.[themeId];
    if (!theme) return;
    const announcements = CONST.COMBAT_ANNOUNCEMENTS ?? ["startEncounter", "nextUp", "yourTurn"];
    const sounds = theme[announcements[CoreCombatSettings.#previewIndex++ % announcements.length]];
    if (!sounds?.length) return;
    game.audio.play(sounds[Math.floor(Math.random() * sounds.length)], { context: game.audio.interface });
  }

  /** Writes only what changed. */
  static async save({ theme, tracker }) {
    const writes = [];
    if (theme !== undefined && theme !== game.settings.get("core", "combatTheme")) {
      writes.push(game.settings.set("core", "combatTheme", theme));
    }
    const saved = CoreCombatSettings.trackerValues();
    if (tracker && saved && JSON.stringify(tracker) !== JSON.stringify(saved)) {
      const config = foundry.utils.deepClone(game.settings.get("core", "combatTrackerConfig") ?? {});
      config.resource = tracker.resource;
      config.skipDefeated = tracker.skipDefeated;
      config.turnMarker = {
        ...config.turnMarker,
        enabled: tracker.markerEnabled,
        animation: tracker.markerAnimation,
        src: tracker.markerSrc,
        disposition: tracker.markerDisposition,
      };
      writes.push(game.settings.set("core", "combatTrackerConfig", config));
    }
    await Promise.all(writes);
  }
}
