import { I18N_ROOT, MODULE_ID, SETTINGS } from "../constants/module-constants.js";
import { SETTINGS_SCHEMA, coerceSetting, settingDefault } from "../constants/settings-schema.js";
import { resolveTheme } from "../helpers/themes.js";
import { healthSourceFor } from "../helpers/health-source.js";
import { normalizeStyles } from "../helpers/combat-styles.js";
import { upgradeLook } from "../helpers/look-upgrades.js";
import { isPortraitRatioOk, portraitRatio, presetFromSettings } from "../helpers/wheel-geometry.js";

const TYPES = { boolean: Boolean, number: Number, choice: String, multi: Array, color: String, file: String, text: String, array: Array, object: Object };

/** The look the appearance editor edits (RF-73): each user's own. Its sounds tab is this browser's, not part of a look. */
const APPEARANCE_ENTRIES = SETTINGS_SCHEMA.filter((entry) => entry.section === "appearance");

/**
 * Registers every setting from SETTINGS_SCHEMA (SPEC §7). None shows in the core
 * menu: they live in the module's own settings screen (RF-70), opened by
 * `SettingsMenu`, and the appearance editor (RF-73), opened by `AppearanceMenu`.
 * `onLayoutChange` rebuilds the wheel; `onDataChange` re-projects the combat.
 */
export function registerSettings({ onLayoutChange, onDataChange, SettingsMenu, AppearanceMenu }) {
  const reactions = {
    layout: onLayoutChange,
    data: onDataChange,
    custom: () => {
      onLayoutChange();
      warnOnPortraitRatio();
    },
  };
  for (const entry of SETTINGS_SCHEMA) {
    game.settings.register(MODULE_ID, entry.key, {
      name: `${I18N_ROOT}.Settings.${entry.key}.Name`,
      hint: `${I18N_ROOT}.Settings.${entry.key}.Hint`,
      scope: entry.scope,
      config: false,
      type: TYPES[entry.type],
      default: settingDefault(entry),
      onChange: reactions[entry.react],
    });
  }
  if (SettingsMenu) {
    game.settings.registerMenu(MODULE_ID, "settingsMenu", {
      name: `${I18N_ROOT}.SettingsMenu.Name`,
      label: `${I18N_ROOT}.SettingsMenu.Label`,
      hint: `${I18N_ROOT}.SettingsMenu.Hint`,
      icon: "fa-solid fa-dharmachakra",
      type: SettingsMenu,
      restricted: false,
    });
  }
  if (AppearanceMenu) {
    game.settings.registerMenu(MODULE_ID, "appearanceMenu", {
      name: `${I18N_ROOT}.AppearanceMenu.Name`,
      label: `${I18N_ROOT}.AppearanceMenu.Label`,
      hint: `${I18N_ROOT}.AppearanceMenu.Hint`,
      icon: "fa-solid fa-palette",
      type: AppearanceMenu,
      // Appearance is each user's own, players included.
      restricted: false,
    });
  }
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

/** The user's own saved look, by setting key. */
export function ownAppearance() {
  return upgradeLook(Object.fromEntries(APPEARANCE_ENTRIES.map((entry) => [entry.key, getSetting(entry.key)])));
}

/**
 * RF-91: whether this user draws with the table look the GM published. The GM
 * always draws their own; players follow it when the GM requires it, or when
 * the GM allows it and they chose to.
 */
function followsTableLook() {
  if (game.user.isGM) return false;
  const mode = getSetting(SETTINGS.tableLookMode);
  if (mode === "forced") return true;
  return mode === "optional" && Boolean(getSetting(SETTINGS.useTableLook));
}

/** The GM's published look over `base`: a key it lacks, or holds a stale value for, keeps the base's. */
export function withTableLook(base) {
  return withLook(base, getSetting(SETTINGS.tableLook) ?? {});
}

/** `shared` look values over `base`, each checked against its setting; a missing or stale one keeps the base's. */
function withLook(base, rawShared) {
  const shared = upgradeLook(rawShared) ?? {};
  const values = { ...base };
  for (const entry of APPEARANCE_ENTRIES) {
    if (!(entry.key in shared)) continue;
    const value = coerceSetting(entry, shared[entry.key]);
    if (value !== null) values[entry.key] = value;
  }
  return values;
}

/** RF-108: the GM's saved styles, cleaned up, their values read like any look (a merged theme upgraded). */
export function savedStyles() {
  return normalizeStyles(getSetting(SETTINGS.savedStyles)).map((style) => ({ ...style, values: upgradeLook(style.values) }));
}

/** A saved style as a whole look: its values over the defaults, as the appearance editor loads it. */
export function styleLook(values) {
  return withLook(Object.fromEntries(APPEARANCE_ENTRIES.map((entry) => [entry.key, settingDefault(entry)])), values);
}

/** The saved style this user's look is, if it is one of them. */
export function currentStyleId(styles = savedStyles()) {
  const own = ownAppearance();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return styles.find((style) => {
    const look = styleLook(style.values);
    return APPEARANCE_ENTRIES.every((entry) => same(look[entry.key], own[entry.key]));
  })?.id ?? null;
}

/**
 * RF-110: makes a saved style this user's look, as if loaded and saved in the
 * editor; the GM's look is also the table look (RF-91). Only what changed is written.
 */
export async function saveLook(values) {
  const look = styleLook(values);
  const writes = APPEARANCE_ENTRIES.filter((entry) => JSON.stringify(look[entry.key]) !== JSON.stringify(getSetting(entry.key))).map((entry) =>
    setSetting(entry.key, look[entry.key]),
  );
  if (game.user.isGM) writes.push(setSetting(SETTINGS.tableLook, look));
  await Promise.all(writes);
}

/** Every appearance value this user draws with, read once per render: their own, or the table look (RF-91). */
export function appearanceValues() {
  const own = ownAppearance();
  return followsTableLook() ? withTableLook(own) : own;
}

/**
 * Appearance used to be stored per browser; it is per user now (RF-91). Copies
 * what this browser had saved, once per user, so nobody loses their look.
 */
export async function migrateBrowserAppearance() {
  if (getSetting(SETTINGS.appearanceMigrated)) return;
  const storage = game.settings.storage.get("client");
  const stored = {};
  for (const entry of APPEARANCE_ENTRIES) {
    const raw = storage?.getItem(`${MODULE_ID}.${entry.key}`);
    if (raw === null || raw === undefined) continue;
    try {
      stored[entry.key] = JSON.parse(raw);
    } catch {
      // Unreadable: the default stands.
    }
  }
  // Old values (the "squares" layout, a merged theme) are converted before they are checked, or they would be dropped.
  const upgraded = upgradeLook(stored);
  for (const entry of APPEARANCE_ENTRIES) {
    if (!(entry.key in upgraded)) continue;
    const value = coerceSetting(entry, upgraded[entry.key]);
    if (value !== null) await setSetting(entry.key, value);
  }
  await setSetting(SETTINGS.appearanceMigrated, true);
}

/** SPEC §6: warn when custom slices stretch portraits past 1.4:1. */
function warnOnPortraitRatio() {
  const values = appearanceValues();
  if (values.view !== "wheel" || values.layoutPreset !== "custom") return;
  const preset = presetFromSettings(values);
  if (isPortraitRatioOk(preset)) return;
  ui.notifications.warn(
    game.i18n.format(`${I18N_ROOT}.Notifications.PortraitRatio`, { ratio: portraitRatio(preset).toFixed(2) }),
  );
}

/** The theme a look draws with, "follow the system" resolved (SPEC §8). */
export function activeTheme(values = appearanceValues()) {
  return resolveTheme({ chosen: values[SETTINGS.theme], systemId: game.system.id });
}

/** RF-47: where this world reads hit points from. */
export function activeHealthSource() {
  return healthSourceFor({
    source: getSetting(SETTINGS.hpSource),
    path: getSetting(SETTINGS.hpPath),
    inverted: getSetting(SETTINGS.hpInverted),
    systemId: game.system.id,
    primaryTokenAttribute: game.system.primaryTokenAttribute,
  });
}

const PORTRAIT_CHOICES = Object.freeze(["token", "actor"]);

/**
 * RF-117: the art this user's slices show. Their look may pick the token or
 * the character; otherwise (or with "table") the world's portrait source.
 * `portraitImage` overrides the saved look (the editor's draft).
 */
export function portraitSource(portraitImage) {
  let choice = portraitImage ?? getSetting(SETTINGS.portraitImage);
  if (portraitImage === undefined && followsTableLook()) choice = getSetting(SETTINGS.tableLook)?.portraitImage ?? choice;
  return PORTRAIT_CHOICES.includes(choice) ? choice : getSetting(SETTINGS.portraitSource);
}

/** The settings the projection reads, gathered once per projection. */
export function projectionSettings({ portraitImage } = {}) {
  return {
    portraitSource: portraitSource(portraitImage),
    hpForPlayers: getSetting(SETTINGS.hpForPlayers),
    npcNames: getSetting(SETTINGS.npcNames),
    defeatedMode: getSetting(SETTINGS.defeatedMode),
    concealment: getSetting(SETTINGS.concealment),
    secondsPerRound: getSetting(SETTINGS.secondsPerRound),
  };
}
