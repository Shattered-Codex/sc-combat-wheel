import { BAR_ITEMS, DEFAULT_PRESET, LAYOUT_PRESETS, PHASE_STRIP_SIZES, SETTINGS, TRACK_SHAPES, TRACK_SIZES, VIEWS } from "./module-constants.js";
import { SOUND_CHOICES } from "../helpers/sound-presets.js";
import { FOLLOW_SYSTEM, THEMES } from "../helpers/themes.js";
import { ORIENTATIONS } from "../helpers/orientation.js";
import { MAX_REACH, MAX_SPACING, MIN_REACH, MIN_SPACING } from "../helpers/track-geometry.js";
import { VENAERYS_ID } from "../helpers/venaerys-phases.js";
import { PARTICLE_INTENSITIES, PARTICLE_MOTIONS, PARTICLE_SPEEDS, PARTICLE_TYPES } from "../helpers/particle-presets.js";
import { STYLE_CHOICES } from "../helpers/theme-style.js";

/**
 * Sections of the settings screen (RF-70), in rail order. Each one holds
 * settings of a single scope, so the screen says plainly who a change reaches:
 * "client" sections apply to this browser, "user" ones to this user wherever
 * they log in, "world" ones to the whole table and only show for the GM (RF-71). `kind: "virtual"` hosts the template editor
 * instead of setting rows; `kind: "editor"` is edited in the appearance editor
 * (RF-73), and the screen only links to it (at its `panel`, when it has one);
 * a `hidden` one has no entry on the rail (the sounds share the appearance's
 * link, RF-111), though opening the screen on it still leads to its tab.
 */
export const SETTING_SECTIONS = Object.freeze([
  { id: "appearance", scope: "user", icon: "fa-solid fa-palette", kind: "editor" },
  { id: "behavior", scope: "client", icon: "fa-solid fa-hand-pointer" },
  { id: "sounds", scope: "client", icon: "fa-solid fa-volume-high", kind: "editor", panel: "sounds", hidden: true },
  { id: "table", scope: "world", icon: "fa-solid fa-users" },
  { id: "players", scope: "world", icon: "fa-solid fa-eye-slash" },
  { id: "rules", scope: "world", icon: "fa-solid fa-scale-balanced" },
  { id: "virtual", scope: "world", icon: "fa-solid fa-bolt", kind: "virtual" },
  { id: "foundry", scope: "world", icon: "fa-solid fa-swords", kind: "core" },
]);

/**
 * Tabs of the appearance editor (RF-73), in order. Appearance settings name
 * theirs with `panel`; the theme and the view (RF-90) are picked on the
 * editor's top bar instead, with `panel: "theme"` and `panel: "view"`. A tab
 * with `module` only shows while that module is active (RF-82). The sounds tab
 * holds this browser's sounds (`scope: "client"`): they are never part of a
 * look, a preset or the table look.
 */
export const APPEARANCE_PANELS = Object.freeze([
  { id: "layout", icon: "fa-solid fa-ruler-combined", scope: "user" },
  { id: "portraits", icon: "fa-solid fa-image-portrait", scope: "user" },
  { id: "bar", icon: "fa-solid fa-sliders", scope: "user" },
  // RF-115: colours and style in one tab, the theme's palette first.
  { id: "visual", icon: "fa-solid fa-swatchbook", scope: "user" },
  { id: "effects", icon: "fa-solid fa-wand-magic-sparkles", scope: "user" },
  // RF-121: the "your turn" announcement, on its own tab.
  { id: "announce", icon: "fa-solid fa-bullhorn", scope: "user" },
  { id: "phases", icon: "fa-solid fa-hourglass-half", scope: "user", module: VENAERYS_ID },
  { id: "sounds", icon: "fa-solid fa-volume-high", scope: "client" },
]);

/**
 * Every module setting, described once: it drives both registration and the
 * settings screen. `react` says what a change needs: "layout" rebuilds the
 * wheel, "data" re-projects the combat, "custom" also checks the custom layout
 * ratio. `section: null` keeps a setting off the screen (the widget or a
 * dedicated editor writes it). `default` may be a function: see settingDefault.
 * `visibleWhen: { key, in | notIn }` (or a list of them, all required) hides
 * a row that another value of the same section makes meaningless.
 * `group` gathers the appearance editor's rows under small headings and
 * `nested: true` indents a row under the one it depends on. A `multi` setting
 * holds a list of its choices. `advanced: true` keeps a fine-tuning row of the appearance editor out of
 * sight until the user asks for all options.
 */
export const SETTINGS_SCHEMA = Object.freeze([
  // Appearance (this browser, edited in the appearance editor)
  { key: SETTINGS.view, scope: "user", type: "choice", choices: VIEWS, default: "wheel", section: "appearance", react: "layout", panel: "view" },
  { key: SETTINGS.layoutPreset, scope: "user", type: "choice", choices: [...Object.keys(LAYOUT_PRESETS), "custom"], default: DEFAULT_PRESET, section: "appearance", react: "layout", group: "size", panel: "layout", visibleWhen: { key: SETTINGS.view, in: ["wheel"] } },
  { key: SETTINGS.customOuter, scope: "user", type: "number", range: { min: 100, max: 400, step: 2 }, default: 180, section: "appearance", react: "custom", group: "size", nested: true, panel: "layout", visibleWhen: [{ key: SETTINGS.view, in: ["wheel"] }, { key: SETTINGS.layoutPreset, in: ["custom"] }] },
  { key: SETTINGS.customInner, scope: "user", type: "number", range: { min: 50, max: 360, step: 2 }, default: 104, section: "appearance", react: "custom", group: "size", nested: true, panel: "layout", visibleWhen: [{ key: SETTINGS.view, in: ["wheel"] }, { key: SETTINGS.layoutPreset, in: ["custom"] }] },
  { key: SETTINGS.customStep, scope: "user", type: "number", range: { min: 15, max: 45, step: 0.5 }, default: 30, section: "appearance", react: "custom", group: "size", nested: true, panel: "layout", visibleWhen: [{ key: SETTINGS.view, in: ["wheel"] }, { key: SETTINGS.layoutPreset, in: ["custom"] }] },
  { key: SETTINGS.orientation, scope: "user", type: "choice", choices: ORIENTATIONS, default: "up", section: "appearance", react: "layout", group: "placement", panel: "layout" },
  { key: SETTINGS.anchor, scope: "user", type: "choice", choices: ["middle", "left", "end"], default: "middle", section: "appearance", react: "layout", advanced: true, group: "placement", panel: "layout" },
  { key: SETTINGS.trackSize, scope: "user", type: "choice", choices: Object.keys(TRACK_SIZES), default: "medium", section: "appearance", react: "layout", group: "size", panel: "layout", visibleWhen: { key: SETTINGS.view, notIn: ["wheel"] } },
  { key: SETTINGS.trackShape, scope: "user", type: "choice", choices: Object.keys(TRACK_SHAPES), default: "square", section: "appearance", react: "layout", group: "size", panel: "layout", visibleWhen: { key: SETTINGS.view, notIn: ["wheel"] } },
  { key: SETTINGS.trackReach, scope: "user", type: "number", range: { min: MIN_REACH, max: MAX_REACH, step: 1 }, default: 3, section: "appearance", react: "layout", group: "size", panel: "layout", visibleWhen: { key: SETTINGS.view, notIn: ["wheel"] } },
  { key: SETTINGS.trackSpacing, scope: "user", type: "number", range: { min: MIN_SPACING, max: MAX_SPACING, step: 1 }, default: 8, section: "appearance", react: "layout", advanced: true, group: "size", panel: "layout", visibleWhen: { key: SETTINGS.view, notIn: ["wheel"] } },
  { key: SETTINGS.portraitShape, scope: "user", type: "choice", choices: ["sector", "square"], default: "sector", section: "appearance", react: "layout", group: "portrait", panel: "portraits", visibleWhen: { key: SETTINGS.view, in: ["wheel"] } },
  // RF-117: the token's art or the character's; "table" keeps what the GM set for the world.
  { key: SETTINGS.portraitImage, scope: "user", type: "choice", choices: ["table", "token", "actor"], default: "table", section: "appearance", react: "data", group: "portrait", panel: "portraits" },
  { key: SETTINGS.sliceGap, scope: "user", type: "number", range: { min: 0, max: 3, step: 0.1 }, default: 0.8, section: "appearance", react: "layout", advanced: true, group: "portrait", panel: "portraits", visibleWhen: { key: SETTINGS.view, in: ["wheel"] } },
  { key: SETTINGS.scale, scope: "user", type: "number", range: { min: 70, max: 150, step: 5 }, default: 100, section: "appearance", react: "layout", group: "size", panel: "layout" },
  { key: SETTINGS.theme, scope: "user", type: "choice", choices: [FOLLOW_SYSTEM, ...THEMES], default: THEMES[0], section: "appearance", react: "data", panel: "theme" },
  { key: SETTINGS.trackNames, scope: "user", type: "choice", choices: ["none", "acting", "all"], default: "acting", section: "appearance", react: "data", group: "info", panel: "portraits", visibleWhen: { key: SETTINGS.view, notIn: ["wheel"] } },
  { key: SETTINGS.showInitiative, scope: "user", type: "boolean", default: false, section: "appearance", react: "data", group: "info", panel: "portraits" },
  { key: SETTINGS.restOpacity, scope: "user", type: "number", range: { min: 40, max: 100, step: 5 }, default: 100, section: "appearance", react: "data", advanced: true, group: "portrait", panel: "portraits" },
  { key: SETTINGS.hpOverlay, scope: "user", type: "choice", choices: ["off", "drain", "fill", "band"], default: "drain", section: "appearance", react: "data", group: "info", panel: "portraits" },
  { key: SETTINGS.hpOverlayOpacity, scope: "user", type: "number", range: { min: 10, max: 90, step: 5 }, default: 45, section: "appearance", react: "data", advanced: true, group: "info", nested: true, panel: "portraits", visibleWhen: { key: SETTINGS.hpOverlay, notIn: ["off"] } },
  { key: SETTINGS.barVisibility, scope: "user", type: "choice", choices: ["always", "hover", "hidden"], default: "always", section: "appearance", react: "data", group: "display", panel: "bar" },
  { key: SETTINGS.barLayout, scope: "user", type: "choice", choices: ["bar", "split"], default: "bar", section: "appearance", react: "layout", group: "display", panel: "bar" },
  { key: SETTINGS.barControls, scope: "user", type: "choice", choices: ["inline", "menu"], default: "menu", section: "appearance", react: "data", group: "display", panel: "bar" },
  { key: SETTINGS.barSize, scope: "user", type: "choice", choices: ["normal", "compact"], default: "compact", section: "appearance", react: "layout", group: "display", panel: "bar" },
  // A lean bar by default: the tools behind "More", and the rarely used items off.
  { key: SETTINGS.barHidden, scope: "user", type: "multi", choices: BAR_ITEMS, default: ["details", "direction", "appearance"], section: "appearance", react: "data", group: "items", panel: "bar" },
  { key: SETTINGS.phaseStripPlacement, scope: "user", type: "choice", choices: ["beyond", "end", "over"], default: "beyond", section: "appearance", react: "data", group: "strip", panel: "phases" },
  { key: SETTINGS.phaseStripImage, scope: "user", type: "choice", choices: ["portrait", "token"], default: "portrait", section: "appearance", react: "data", group: "strip", panel: "phases" },
  { key: SETTINGS.phaseStripFrame, scope: "user", type: "choice", choices: ["round", "square", "tiles", "none"], default: "round", section: "appearance", react: "data", group: "strip", panel: "phases" },
  { key: SETTINGS.phaseStripSize, scope: "user", type: "choice", choices: Object.keys(PHASE_STRIP_SIZES), default: "medium", section: "appearance", react: "data", advanced: true, group: "strip", panel: "phases" },
  { key: SETTINGS.phaseStripNames, scope: "user", type: "boolean", default: true, section: "appearance", react: "data", advanced: true, group: "strip", panel: "phases" },
  // RF-116: the auras, waves and frames of the SC Item Rarity Colors, around the acting portrait and the whole widget.
  { key: SETTINGS.actingEffect, scope: "user", type: "choice", choices: ["none", "pulse", "halo", "aura", "flicker", "flames", "inferno", "void", "rays", "storm", "runes", "shine"], default: "pulse", section: "appearance", react: "data", group: "acting", panel: "effects" },
  { key: SETTINGS.actingWaves, scope: "user", type: "choice", choices: ["none", "energy", "ripples", "shockwave", "arcane", "mist", "sonar", "prism", "burst"], default: "none", section: "appearance", react: "data", group: "acting", panel: "effects" },
  { key: SETTINGS.turnEffect, scope: "user", type: "choice", choices: ["none", "ripple", "burst", "flash", "pop", "shockwave", "lightning"], default: "ripple", section: "appearance", react: "data", group: "acting", panel: "effects" },
  { key: SETTINGS.widgetEffect, scope: "user", type: "choice", choices: ["none", "pulse", "halo", "flames", "inferno", "rays", "storm", "runes"], default: "none", section: "appearance", react: "data", group: "widget", panel: "effects" },
  { key: SETTINGS.particleIntensity, scope: "user", type: "choice", choices: Object.keys(PARTICLE_INTENSITIES), default: "normal", section: "appearance", react: "data", group: "acting", panel: "effects" },
  { key: SETTINGS.particleSpeed, scope: "user", type: "choice", choices: Object.keys(PARTICLE_SPEEDS), default: "normal", section: "appearance", react: "data", advanced: true, group: "acting", panel: "effects" },
  { key: SETTINGS.colorAccent, scope: "user", type: "color", default: "", section: "appearance", react: "data", group: "palette", panel: "visual" },
  { key: SETTINGS.colorBackground, scope: "user", type: "color", default: "", section: "appearance", react: "data", group: "palette", panel: "visual" },
  { key: SETTINGS.colorSurface, scope: "user", type: "color", default: "", section: "appearance", react: "data", advanced: true, group: "palette", panel: "visual" },
  { key: SETTINGS.colorText, scope: "user", type: "color", default: "", section: "appearance", react: "data", group: "palette", panel: "visual" },
  { key: SETTINGS.colorActive, scope: "user", type: "color", default: "", section: "appearance", react: "data", advanced: true, group: "acting", panel: "effects" },
  { key: SETTINGS.colorFriendly, scope: "user", type: "color", default: "", section: "appearance", react: "data", advanced: true, group: "sides", panel: "visual" },
  { key: SETTINGS.colorNeutral, scope: "user", type: "color", default: "", section: "appearance", react: "data", advanced: true, group: "sides", panel: "visual" },
  { key: SETTINGS.colorHostile, scope: "user", type: "color", default: "", section: "appearance", react: "data", advanced: true, group: "sides", panel: "visual" },
  { key: SETTINGS.colorSecret, scope: "user", type: "color", default: "", section: "appearance", react: "data", advanced: true, group: "sides", panel: "visual" },
  // RF-113: a sci-fi theme's signature touches, for any theme, in its colours.
  { key: SETTINGS.styleFinish, scope: "user", type: "choice", choices: ["theme", "hud", "neon", "crt", "hazard", "glitch"], default: "theme", section: "appearance", react: "data", group: "finish", panel: "visual" },
  { key: SETTINGS.styleFont, scope: "user", type: "choice", choices: STYLE_CHOICES.font, default: "theme", section: "appearance", react: "data", group: "text", panel: "visual" },
  { key: SETTINGS.styleCorners, scope: "user", type: "choice", choices: STYLE_CHOICES.corners, default: "theme", section: "appearance", react: "data", group: "panels", panel: "visual" },
  { key: SETTINGS.stylePanels, scope: "user", type: "choice", choices: STYLE_CHOICES.panels, default: "theme", section: "appearance", react: "data", group: "panels", panel: "visual" },
  { key: SETTINGS.styleRim, scope: "user", type: "choice", choices: STYLE_CHOICES.rim, default: "theme", section: "appearance", react: "data", group: "portrait", panel: "visual" },
  { key: SETTINGS.styleNames, scope: "user", type: "choice", choices: STYLE_CHOICES.names, default: "theme", section: "appearance", react: "data", advanced: true, group: "text", panel: "visual" },
  { key: SETTINGS.styleButtons, scope: "user", type: "choice", choices: STYLE_CHOICES.buttons, default: "theme", section: "appearance", react: "data", advanced: true, group: "panels", panel: "visual" },
  { key: SETTINGS.particleType, scope: "user", type: "choice", choices: PARTICLE_TYPES, default: "none", section: "appearance", react: "data", group: "particles", panel: "effects" },
  { key: SETTINGS.particleMotion, scope: "user", type: "choice", choices: PARTICLE_MOTIONS, default: "auto", section: "appearance", react: "data", group: "particles", nested: true, panel: "effects", visibleWhen: { key: SETTINGS.particleType, notIn: ["none"] } },
  { key: SETTINGS.particlePlacement, scope: "user", type: "choice", choices: ["acting", "widget"], default: "acting", section: "appearance", react: "data", group: "particles", nested: true, panel: "effects", visibleWhen: { key: SETTINGS.particleType, notIn: ["none"] } },
  { key: SETTINGS.particleColor, scope: "user", type: "choice", choices: ["theme", "side", "custom"], default: "theme", section: "appearance", react: "data", group: "particles", nested: true, panel: "effects", visibleWhen: { key: SETTINGS.particleType, notIn: ["none"] } },
  { key: SETTINGS.particleCustomColor, scope: "user", type: "color", default: "#ffc56b", section: "appearance", react: "data", group: "particles", nested: true, panel: "effects", visibleWhen: [{ key: SETTINGS.particleType, notIn: ["none"] }, { key: SETTINGS.particleColor, in: ["custom"] }] },
  // RF-121: the turn announcement. "auto": every turn for the GM, their own for a player.
  { key: SETTINGS.announceMode, scope: "user", type: "choice", choices: ["auto", "own", "all", "off"], default: "auto", section: "appearance", react: null, group: "announceWhen", panel: "announce" },
  { key: SETTINGS.announceNextUp, scope: "user", type: "boolean", default: true, section: "appearance", react: null, group: "announceWhen", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceTitle, scope: "user", type: "text", default: "", section: "appearance", react: null, group: "announceContent", panel: "announce", placeholder: true, visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceImage, scope: "user", type: "choice", choices: ["actor", "token", "none"], default: "actor", section: "appearance", react: null, group: "announceContent", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceFrame, scope: "user", type: "choice", choices: ["round", "square", "tall", "free"], default: "round", section: "appearance", react: null, group: "announceContent", panel: "announce", visibleWhen: [{ key: SETTINGS.announceMode, notIn: ["off"] }, { key: SETTINGS.announceImage, notIn: ["none"] }] },
  { key: SETTINGS.announceBorder, scope: "user", type: "choice", choices: ["color", "thin", "glow", "none"], default: "color", section: "appearance", react: null, group: "announceContent", panel: "announce", visibleWhen: [{ key: SETTINGS.announceMode, notIn: ["off"] }, { key: SETTINGS.announceImage, notIn: ["none"] }] },
  { key: SETTINGS.announceStyle, scope: "user", type: "choice", choices: ["card", "cinematic", "corner"], default: "card", section: "appearance", react: null, group: "announceLook", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announcePosition, scope: "user", type: "choice", choices: ["top", "center", "bottom"], default: "center", section: "appearance", react: null, group: "announceLook", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceSize, scope: "user", type: "choice", choices: ["small", "normal", "large"], default: "normal", section: "appearance", react: null, group: "announceLook", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceSeconds, scope: "user", type: "number", range: { min: 1, max: 8, step: 0.5 }, default: 3, section: "appearance", react: null, group: "announceLook", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceEntrance, scope: "user", type: "choice", choices: ["zoom", "slide", "fade"], default: "zoom", section: "appearance", react: null, group: "announceLook", panel: "announce", advanced: true, visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceColor, scope: "user", type: "choice", choices: ["side", "theme", "custom"], default: "side", section: "appearance", react: null, group: "announceLook", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceCustomColor, scope: "user", type: "color", default: "#ffc56b", section: "appearance", react: null, group: "announceLook", nested: true, panel: "announce", visibleWhen: [{ key: SETTINGS.announceMode, notIn: ["off"] }, { key: SETTINGS.announceColor, in: ["custom"] }] },
  { key: SETTINGS.announceEffect, scope: "user", type: "choice", choices: ["none", "pulse", "halo", "aura", "flicker", "flames", "inferno", "void", "rays", "storm", "runes"], default: "flames", section: "appearance", react: null, group: "announceFx", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceParticles, scope: "user", type: "choice", choices: PARTICLE_TYPES, default: "sparks", section: "appearance", react: null, group: "announceFx", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.announceIntensity, scope: "user", type: "choice", choices: Object.keys(PARTICLE_INTENSITIES), default: "normal", section: "appearance", react: null, group: "announceFx", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  // RF-123: a player's card for the table, shown to everyone on their character's turn; anyone may keep their own look instead.
  { key: SETTINGS.announceShareCard, scope: "user", type: "boolean", default: false, section: "appearance", react: null, group: "announceShare", panel: "announce" },
  { key: SETTINGS.announcePlayerCards, scope: "user", type: "boolean", default: true, section: "appearance", react: null, group: "announceShare", panel: "announce", visibleWhen: { key: SETTINGS.announceMode, notIn: ["off"] } },
  { key: SETTINGS.animationSpeed, scope: "user", type: "choice", choices: ["slow", "normal", "fast", "off"], default: "normal", section: "appearance", react: null, group: "motion", panel: "effects" },
  // RF-106: the on-screen message of a virtual position, read when it shows.
  { key: SETTINGS.bannerStyle, scope: "user", type: "choice", choices: ["card", "strip", "toast"], default: "card", section: "appearance", react: null, group: "banner", panel: "visual" },
  { key: SETTINGS.bannerPosition, scope: "user", type: "choice", choices: ["top", "center", "bottom"], default: "top", section: "appearance", react: null, group: "banner", panel: "visual" },
  { key: SETTINGS.bannerSize, scope: "user", type: "choice", choices: ["small", "normal", "large"], default: "normal", section: "appearance", react: null, group: "banner", panel: "visual" },
  { key: SETTINGS.bannerImage, scope: "user", type: "boolean", default: true, section: "appearance", react: null, group: "banner", panel: "visual" },

  // Behaviour (this browser)
  { key: SETTINGS.openOnStart, scope: "client", type: "boolean", default: true, section: "behavior", react: null },
  { key: SETTINGS.hideNativeTracker, scope: "client", type: "boolean", default: false, section: "behavior", react: "data" },
  { key: SETTINGS.clickAction, scope: "client", type: "choice", choices: ["menu", "pan", "select", "sheet", "none"], default: "pan", section: "behavior", react: null },
  // RF-31: like the core tracker, a double click opens the sheet unless told otherwise; the right click opens the slice's menu (RF-122), which any of them may open.
  { key: SETTINGS.doubleClickAction, scope: "client", type: "choice", choices: ["menu", "pan", "select", "sheet", "none"], default: "sheet", section: "behavior", react: null },
  { key: SETTINGS.rightClickAction, scope: "client", type: "choice", choices: ["menu", "pan", "select", "sheet", "none"], default: "menu", section: "behavior", react: null },
  { key: SETTINGS.cameraFollows, scope: "client", type: "boolean", default: false, section: "behavior", react: null },
  { key: SETTINGS.cameraPan, scope: "client", type: "choice", choices: ["fast", "smooth", "slow"], default: "smooth", section: "behavior", react: null },

  // Sounds (this browser, RF-50 to RF-54)
  { key: SETTINGS.soundVolume, scope: "client", type: "number", range: { min: 0, max: 100, step: 5 }, default: 60, section: "sounds", react: null, panel: "sounds" },
  { key: SETTINGS.soundTurnChange, scope: "client", type: "choice", choices: SOUND_CHOICES, default: "off", section: "sounds", react: null, panel: "sounds", sound: "turnChange" },
  { key: SETTINGS.soundTurnChangeFile, scope: "client", type: "file", fileType: "audio", default: "", section: "sounds", react: null, panel: "sounds", fileFor: "turnChange", visibleWhen: { key: SETTINGS.soundTurnChange, in: ["file"] } },
  { key: SETTINGS.soundOwnTurn, scope: "client", type: "choice", choices: SOUND_CHOICES, default: "bell", section: "sounds", react: null, panel: "sounds", sound: "ownTurn" },
  { key: SETTINGS.soundOwnTurnFile, scope: "client", type: "file", fileType: "audio", default: "", section: "sounds", react: null, panel: "sounds", fileFor: "ownTurn", visibleWhen: { key: SETTINGS.soundOwnTurn, in: ["file"] } },
  { key: SETTINGS.soundNextUp, scope: "client", type: "choice", choices: SOUND_CHOICES, default: "chime", section: "sounds", react: null, panel: "sounds", sound: "nextUp" },
  { key: SETTINGS.soundNextUpFile, scope: "client", type: "file", fileType: "audio", default: "", section: "sounds", react: null, panel: "sounds", fileFor: "nextUp", visibleWhen: { key: SETTINGS.soundNextUp, in: ["file"] } },
  { key: SETTINGS.soundRoundStart, scope: "client", type: "choice", choices: SOUND_CHOICES, default: "off", section: "sounds", react: null, panel: "sounds", sound: "roundStart" },
  { key: SETTINGS.soundRoundStartFile, scope: "client", type: "file", fileType: "audio", default: "", section: "sounds", react: null, panel: "sounds", fileFor: "roundStart", visibleWhen: { key: SETTINGS.soundRoundStart, in: ["file"] } },
  { key: SETTINGS.soundCombatStart, scope: "client", type: "choice", choices: SOUND_CHOICES, default: "drum", section: "sounds", react: null, panel: "sounds", sound: "combatStart" },
  { key: SETTINGS.soundCombatStartFile, scope: "client", type: "file", fileType: "audio", default: "", section: "sounds", react: null, panel: "sounds", fileFor: "combatStart", visibleWhen: { key: SETTINGS.soundCombatStart, in: ["file"] } },
  { key: SETTINGS.soundTurnBack, scope: "client", type: "choice", choices: SOUND_CHOICES, default: "off", section: "sounds", react: null, panel: "sounds", sound: "turnBack" },
  { key: SETTINGS.soundTurnBackFile, scope: "client", type: "file", fileType: "audio", default: "", section: "sounds", react: null, panel: "sounds", fileFor: "turnBack", visibleWhen: { key: SETTINGS.soundTurnBack, in: ["file"] } },
  { key: SETTINGS.soundCombatEnd, scope: "client", type: "choice", choices: SOUND_CHOICES, default: "off", section: "sounds", react: null, panel: "sounds", sound: "combatEnd" },
  { key: SETTINGS.soundCombatEndFile, scope: "client", type: "file", fileType: "audio", default: "", section: "sounds", react: null, panel: "sounds", fileFor: "combatEnd", visibleWhen: { key: SETTINGS.soundCombatEnd, in: ["file"] } },

  // Table (world)
  { key: SETTINGS.portraitSource, scope: "world", type: "choice", choices: ["token", "actor", "flag"], default: "token", section: "table", react: "data" },
  { key: SETTINGS.soundsAllowed, scope: "world", type: "boolean", default: true, section: "table", react: null },
  { key: SETTINGS.nextUpNotice, scope: "world", type: "boolean", default: true, section: "table", react: null },

  // What players see (world)
  { key: SETTINGS.hpForPlayers, scope: "world", type: "choice", choices: ["number", "bar", "state", "hidden"], default: "state", section: "players", react: "data" },
  { key: SETTINGS.npcNames, scope: "world", type: "choice", choices: ["always", "token"], default: "always", section: "players", react: "data" },
  { key: SETTINGS.concealment, scope: "world", type: "choice", choices: ["hidden", "tokenHidden", "invisible"], default: "tokenHidden", section: "players", react: "data" },

  // Combat rules (world)
  { key: SETTINGS.hpSource, scope: "world", type: "choice", choices: ["auto", "bar1", "bar2", "attribute"], default: "auto", section: "rules", react: "data" },
  { key: SETTINGS.hpPath, scope: "world", type: "text", default: "", section: "rules", react: "data", visibleWhen: { key: SETTINGS.hpSource, in: ["attribute"] } },
  { key: SETTINGS.hpInverted, scope: "world", type: "boolean", default: false, section: "rules", react: "data" },
  { key: SETTINGS.defeatedMode, scope: "world", type: "choice", choices: ["fade", "remove"], default: "fade", section: "rules", react: "data" },
  { key: SETTINGS.skipDead, scope: "world", type: "choice", choices: ["never", "npcs", "all"], default: "never", section: "rules", react: null },
  { key: SETTINGS.secondsPerRound, scope: "world", type: "number", range: { min: 1, max: 600, step: 1 }, default: () => CONFIG.time?.roundTime ?? 6, section: "rules", react: "data" },

  // The table look (RF-91): the GM's saved look, published for players to follow
  { key: SETTINGS.tableLook, scope: "world", type: "object", default: {}, section: null, react: "layout" },
  { key: SETTINGS.tableLookMode, scope: "world", type: "choice", choices: ["optional", "partial", "forced", "off"], default: "optional", section: null, react: "layout" },
  // RF-119: under "partial", the options the GM keeps for the whole table (appearance setting keys).
  { key: SETTINGS.lockedLook, scope: "world", type: "array", default: () => [], section: null, react: "layout" },
  { key: SETTINGS.useTableLook, scope: "user", type: "boolean", default: true, section: null, react: "layout" },
  // RF-108: the GM's saved styles.
  { key: SETTINGS.savedStyles, scope: "world", type: "array", default: () => [], section: null, react: "layout" },
  // Retired (D-32): combats no longer have a style of their own. Still registered so stored values survive.
  { key: SETTINGS.combatStyleDefault, scope: "world", type: "text", default: "", section: null, react: null },
  { key: SETTINGS.combatStylePrompt, scope: "world", type: "boolean", default: false, section: null, react: null },
  { key: SETTINGS.editorAdvanced, scope: "client", type: "boolean", default: false, section: null, react: null },
  { key: SETTINGS.appearanceMigrated, scope: "user", type: "boolean", default: false, section: null, react: null },

  // Written elsewhere
  { key: SETTINGS.virtualTemplates, scope: "world", type: "array", default: [], section: null, react: "data" },
  // RF-124: where each user left the wheel, on any browser; the old per-browser value is only read until they save their own.
  { key: SETTINGS.widgetState, scope: "client", type: "object", default: { position: null, locked: false, expanded: false }, section: null, react: null },
  { key: SETTINGS.userWidgetState, scope: "user", type: "object", default: {}, section: null, react: null },
]);

/** The setting's default value; function defaults read Foundry's config, so they resolve late. */
export function settingDefault(entry) {
  return typeof entry.default === "function" ? entry.default() : structuredClone(entry.default);
}

/** Whether an editor row means anything with these values (see `visibleWhen`). */
export function isSettingShown(entry, values) {
  return visibilityRules(entry).every((rule) => {
    const value = values[rule.key];
    return rule.in ? rule.in.includes(value) : !rule.notIn.includes(value);
  });
}

/** The `visibleWhen` rules of an entry, always as a list. */
export function visibilityRules(entry) {
  const rules = entry.visibleWhen;
  if (!rules) return [];
  return Array.isArray(rules) ? rules : [rules];
}

/** Coerces a form value into the setting's type, keeping it inside its range. */
export function coerceSetting(entry, raw) {
  switch (entry.type) {
    case "boolean":
      return raw === true || raw === "true" || raw === "on";
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      const { min = -Infinity, max = Infinity } = entry.range ?? {};
      return Math.min(Math.max(value, min), max);
    }
    case "choice":
      return entry.choices.includes(raw) ? raw : null;
    case "multi":
      return Array.isArray(raw) ? entry.choices.filter((choice) => raw.includes(choice)) : null;
    case "color": {
      const value = String(raw ?? "").trim();
      return value === "" || /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
    }
    case "file":
    case "text":
      return String(raw ?? "").trim();
    default:
      return raw;
  }
}
