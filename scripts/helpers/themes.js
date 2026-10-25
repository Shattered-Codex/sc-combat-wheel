/**
 * SPEC §8, grouped the way the theme picker lists them (an <optgroup> each).
 * "system" (FOLLOW_SYSTEM) is not a theme and is listed on its own, first.
 */
export const THEME_GROUPS = Object.freeze(
  [
    { id: "general", themes: ["nocturne", "foundry", "parchment", "stone", "contrast", "transparent"] },
    { id: "sober", themes: ["graphite", "mist", "nord", "midnight", "paper"] },
    { id: "vivid", themes: ["verdant", "crimson", "abyss", "ember", "frost", "royal", "arcane", "infernal", "celestial", "sakura", "steampunk"] },
    { id: "horror", themes: ["eldritch", "gothic", "noir", "bloodmoon"] },
    { id: "systems", themes: ["dnd5e", "pf2e", "daggerheart", "coc7"] },
    { id: "scifi", themes: ["scifi-holo", "scifi-neon", "scifi-terminal", "scifi-alert", "scifi-synth", "scifi-cyber"] },
    // Card carousels with their own structure: frames, health bars, panels.
    { id: "carousels", themes: ["obsidian", "tide"] },
  ].map((group) => Object.freeze({ id: group.id, themes: Object.freeze(group.themes) })),
);

/** Every theme, in picker order. The first one is the default. */
export const THEMES = Object.freeze(THEME_GROUPS.flatMap((group) => group.themes));

/** "Follow the game system": the theme each supported system maps to. */
export const SYSTEM_THEMES = Object.freeze({
  dnd5e: "dnd5e",
  pf2e: "pf2e",
  daggerheart: "daggerheart",
  CoC7: "coc7",
});

export const FOLLOW_SYSTEM = "system";

/**
 * The theme a look draws with: "system" resolves through the active game
 * system; anything unknown falls back to the default. (The GM sets the whole
 * table's look, theme included, through the table look, RF-91.)
 */
export function resolveTheme({ chosen, systemId }) {
  const theme = chosen === FOLLOW_SYSTEM ? SYSTEM_THEMES[systemId] : chosen;
  return THEMES.includes(theme) ? theme : THEMES[0];
}
