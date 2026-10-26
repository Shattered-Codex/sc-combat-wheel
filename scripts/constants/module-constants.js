export const MODULE_ID = "sc-combat-wheel";
export const I18N_ROOT = "SC_COMBAT_WHEEL";
export const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates`;
/** In cascade order: the tokens first, the themes and finishes over the base rules. Loaded by StyleLoader. */
export const STYLESHEETS = Object.freeze([
  "styles/tokens.css",
  "styles/theme-fonts.css",
  "styles/themes.css",
  "styles/module.css",
  "styles/particles.css",
  "styles/effects.css",
  "styles/finishes.css",
  "styles/settings.css",
]);
/** RF-108: the combat style a combat was given, under the module's flags (`flags.sc-combat-wheel.style`). */

export const SETTINGS = Object.freeze({
  openOnStart: "openOnStart",
  hideNativeTracker: "hideNativeTracker",
  layoutPreset: "layoutPreset",
  orientation: "orientation",
  anchor: "anchor",
  widgetState: "widgetState",
  portraitSource: "portraitSource",
  clickAction: "clickAction",
  doubleClickAction: "doubleClickAction",
  rightClickAction: "rightClickAction",
  cameraFollows: "cameraFollows",
  hpForPlayers: "hpForPlayers",
  defeatedMode: "defeatedMode",
  npcNames: "npcNames",
  nextUpNotice: "nextUpNotice",
  secondsPerRound: "secondsPerRound",
  animationSpeed: "animationSpeed",
  portraitShape: "portraitShape",
  portraitImage: "portraitImage",
  sliceGap: "sliceGap",
  scale: "scale",
  restOpacity: "restOpacity",
  theme: "theme",
  customOuter: "customOuter",
  customInner: "customInner",
  customStep: "customStep",
  soundsAllowed: "soundsAllowed",
  soundVolume: "soundVolume",
  soundTurnChange: "soundTurnChange",
  soundTurnChangeFile: "soundTurnChangeFile",
  soundOwnTurn: "soundOwnTurn",
  soundOwnTurnFile: "soundOwnTurnFile",
  soundNextUp: "soundNextUp",
  soundNextUpFile: "soundNextUpFile",
  soundRoundStart: "soundRoundStart",
  soundRoundStartFile: "soundRoundStartFile",
  soundCombatStart: "soundCombatStart",
  soundCombatStartFile: "soundCombatStartFile",
  virtualTemplates: "virtualTemplates",
  concealment: "concealment",
  skipDead: "skipDead",
  hpSource: "hpSource",
  hpPath: "hpPath",
  hpInverted: "hpInverted",
  hpOverlay: "hpOverlay",
  hpOverlayOpacity: "hpOverlayOpacity",
  view: "view",
  trackSize: "trackSize",
  trackReach: "trackReach",
  trackShape: "trackShape",
  trackSpacing: "trackSpacing",
  trackNames: "trackNames",
  barControls: "barControls",
  barLayout: "barLayout",
  styleFinish: "styleFinish",
  cameraPan: "cameraPan",
  savedStyles: "savedStyles",
  combatStyleDefault: "combatStyleDefault",
  combatStylePrompt: "combatStylePrompt",
  bannerStyle: "bannerStyle",
  bannerPosition: "bannerPosition",
  bannerSize: "bannerSize",
  bannerImage: "bannerImage",
  phaseStripPlacement: "phaseStripPlacement",
  phaseStripImage: "phaseStripImage",
  phaseStripFrame: "phaseStripFrame",
  phaseStripSize: "phaseStripSize",
  phaseStripNames: "phaseStripNames",
  barSize: "barSize",
  showInitiative: "showInitiative",
  colorAccent: "colorAccent",
  colorBackground: "colorBackground",
  colorSurface: "colorSurface",
  colorText: "colorText",
  colorFriendly: "colorFriendly",
  colorNeutral: "colorNeutral",
  colorHostile: "colorHostile",
  colorSecret: "colorSecret",
  colorActive: "colorActive",
  tableLook: "tableLook",
  tableLookMode: "tableLookMode",
  useTableLook: "useTableLook",
  appearanceMigrated: "appearanceMigrated",
  particleType: "particleType",
  particleMotion: "particleMotion",
  particlePlacement: "particlePlacement",
  particleSpeed: "particleSpeed",
  particleIntensity: "particleIntensity",
  particleColor: "particleColor",
  particleCustomColor: "particleCustomColor",
  editorAdvanced: "editorAdvanced",
  styleFont: "styleFont",
  styleCorners: "styleCorners",
  stylePanels: "stylePanels",
  styleRim: "styleRim",
  styleNames: "styleNames",
  styleButtons: "styleButtons",
  barVisibility: "barVisibility",
  barHidden: "barHidden",
  actingEffect: "actingEffect",
  actingWaves: "actingWaves",
  turnEffect: "turnEffect",
  widgetEffect: "widgetEffect",
  soundTurnBack: "soundTurnBack",
  soundTurnBackFile: "soundTurnBackFile",
  soundCombatEnd: "soundCombatEnd",
  soundCombatEndFile: "soundCombatEndFile",
});

/** Hook fired on every client that can see a virtual position when its turn comes (RF-63). */
export const VIRTUAL_TURN_HOOK = "scCombatWheel.virtualTurn";


/** Mirrors CONST.TOKEN_DISPOSITIONS so pure code does not need Foundry loaded. */
export const DISPOSITION = Object.freeze({
  SECRET: -2,
  HOSTILE: -1,
  NEUTRAL: 0,
  FRIENDLY: 1,
});

export const DISPOSITION_KEYS = Object.freeze({
  [DISPOSITION.SECRET]: "secret",
  [DISPOSITION.HOSTILE]: "hostile",
  [DISPOSITION.NEUTRAL]: "neutral",
  [DISPOSITION.FRIENDLY]: "friendly",
});

/** Mirrors CONST.TOKEN_DISPLAY_MODES. */
export const TOKEN_DISPLAY = Object.freeze({
  NONE: 0,
  CONTROL: 10,
  OWNER_HOVER: 20,
  HOVER: 30,
  OWNER: 40,
  ALWAYS: 50,
});

/** SPEC §6. `E` is how far the active slice grows past the outer radius. */
export const LAYOUT_PRESETS = Object.freeze({
  mini: { R: 128, r0: 80, E: 10, step: 30, gap: 0.8 },
  compact: { R: 160, r0: 96, E: 12, step: 30, gap: 0.8 },
  dense: { R: 170, r0: 110, E: 12, step: 22.5, gap: 0.6 },
  large: { R: 250, r0: 108, E: 16, step: 30, gap: 0.8 },
});

export const DEFAULT_PRESET = "compact";

/**
 * How the turn order is drawn (RF-90): the half wheel, or cards in a line along
 * the bar. "carousel" is a flat row whose acting card rises; "slider" keeps the
 * acting card in focus with the others shrinking and turning away to the sides.
 */
export const VIEWS = Object.freeze(["wheel", "carousel", "slider"]);

/** Side of a square card in the card views, in px. */
export const TRACK_SIZES = Object.freeze({ small: 56, medium: 72, large: 96 });

/** Card proportions, as factors of the size: about the same area, upright or lying down. */
export const TRACK_SHAPES = Object.freeze({
  square: { width: 1, height: 1 },
  tall: { width: 0.85, height: 1.15 },
  wide: { width: 1.15, height: 0.85 },
});

/** SPEC §9 timings, in milliseconds. */
export const TIMING = Object.freeze({
  singleStep: 600,
  jumpStep: 130,
  jumpBudget: 1200,
  fade: 120,
  refreshBatch: 50,
});

export const ANIMATION_SPEED = Object.freeze({
  slow: 1.5,
  normal: 1,
  fast: 0.6,
  off: 0,
});

/** Bar thickness; `expandedSide` is the vertical rail's, whose details need a wider column; `compact` the slim bar's. */
export const BAR_HEIGHT = Object.freeze({ collapsed: 44, compact: 32, expanded: 256, expandedSide: 320 });

/**
 * RF-104: the split bar's two columns beside the portraits — the gap to the
 * portraits, a column's width, and the room one button takes along it.
 */
export const SPLIT_POD = Object.freeze({ gap: 6, width: 42, cell: 32 });

/** What the bar can show (RF-99), in bar order; `barHidden` lists the ones a user turned off. */
export const BAR_ITEMS = Object.freeze([
  "grab", "previous", "endTurn", "round", "roll", "virtual", "grid", "details",
  "lock", "direction", "appearance", "style", "settings", "endCombat",
]);

/** The style tweaks (RF-98): setting key by tweak of theme-style.js. */
export const STYLE_SETTINGS = Object.freeze({
  font: "styleFont",
  corners: "styleCorners",
  panels: "stylePanels",
  rim: "styleRim",
  names: "styleNames",
  buttons: "styleButtons",
});

/** The custom colors (RF-92): setting key by color role of theme-colors.js. */
export const COLOR_SETTINGS = Object.freeze({
  accent: "colorAccent",
  background: "colorBackground",
  surface: "colorSurface",
  text: "colorText",
  friendly: "colorFriendly",
  neutral: "colorNeutral",
  hostile: "colorHostile",
  secret: "colorSecret",
  active: "colorActive",
});
export const BAR_MIN_WIDTH = 460;
/** Portrait side of the Venaerys phase strip, by size setting (RF-82). */
export const PHASE_STRIP_SIZES = Object.freeze({ small: 36, medium: 44, large: 60 });
/** What the strip adds around its portraits: gap to the bar, padding and border, and a name under each. */
export const PHASE_STRIP_ROOM = Object.freeze({ frame: 20, name: 16 });
export const PAST_OPACITY = 0.45;
export const HIDDEN_OPACITY = 0.45;
