/**
 * Ready-made looks for the appearance editor (RF-97). A preset is applied over
 * the defaults, so the result never depends on what was on screen before;
 * every value must be a valid value of its setting (see settings-schema).
 * `swatch` is the theme drawn on the preset's card.
 */
export const APPEARANCE_PRESETS = Object.freeze([
  {
    id: "classic",
    icon: "fa-solid fa-dharmachakra",
    swatch: "nocturne",
    values: { view: "wheel", theme: "nocturne" },
  },
  {
    id: "system",
    icon: "fa-solid fa-dice-d20",
    swatch: "dnd5e",
    values: { view: "wheel", theme: "system", showInitiative: true },
  },
  {
    id: "minimal",
    icon: "fa-solid fa-minus",
    swatch: "graphite",
    values: { view: "carousel", theme: "graphite", trackSize: "small", barSize: "compact", barControls: "menu", restOpacity: 85 },
  },
  {
    id: "sidebar",
    icon: "fa-solid fa-table-columns",
    swatch: "nord",
    values: { view: "carousel", theme: "nord", orientation: "left", trackShape: "wide", trackNames: "all", barSize: "compact" },
  },
  {
    id: "spotlight",
    icon: "fa-solid fa-clone",
    swatch: "royal",
    values: { view: "slider", theme: "royal", trackSize: "large", trackShape: "tall", particleType: "stardust", particleIntensity: "subtle" },
  },
  {
    id: "streaming",
    icon: "fa-solid fa-video",
    swatch: "mist",
    values: { view: "slider", theme: "mist", trackSize: "large", trackNames: "all", showInitiative: true, particleType: "fireflies", particleIntensity: "subtle" },
  },
  {
    id: "fantasy",
    icon: "fa-solid fa-dragon",
    swatch: "crimson",
    values: { view: "wheel", theme: "crimson", particleType: "embers", particleColor: "side" },
  },
  {
    id: "obsidian",
    icon: "fa-solid fa-table-columns",
    swatch: "obsidian",
    values: {
      view: "carousel", theme: "obsidian", orientation: "down", trackShape: "tall", trackReach: 4, trackSpacing: 10,
      styleCorners: "sharp", trackNames: "none", showInitiative: true, hpOverlay: "band", barLayout: "split", barVisibility: "hover",
    },
  },
  {
    id: "tide",
    icon: "fa-solid fa-film",
    swatch: "tide",
    values: {
      view: "carousel", theme: "tide", orientation: "up", trackShape: "tall", trackReach: 4, trackSpacing: 8,
      trackNames: "none", showInitiative: true, hpOverlay: "band", barSize: "compact",
    },
  },
  {
    id: "scifi",
    icon: "fa-solid fa-satellite",
    swatch: "scifi-holo",
    values: { view: "wheel", theme: "scifi-holo", particleType: "sparks", particleIntensity: "subtle", barSize: "compact" },
  },
]);
