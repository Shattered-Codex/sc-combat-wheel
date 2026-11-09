/**
 * User color overrides on top of any theme: each picked color becomes the
 * --scw-* variables to set inline on the widget root, which beat the theme's
 * own values. Derived variables follow the same mixes tokens.css uses, so one
 * color recolors everything that depends on it.
 */

export const COLOR_KEYS = Object.freeze([
  "accent",
  "background",
  "surface",
  "text",
  "friendly",
  "neutral",
  "hostile",
  "secret",
  "active",
]);

const mix = (hex, percent, other) => `color-mix(in srgb, ${hex} ${percent}%, ${other})`;

/**
 * RF-114: the structure tokens.css derives from the palette, set again here so
 * a picked colour reshapes it even on a theme that draws its own (sci-fi,
 * game systems).
 */
const SURFACE_RECIPE = "linear-gradient(180deg, color-mix(in oklab, var(--scw-surface) 88%, var(--scw-accent) 12%), color-mix(in oklab, var(--scw-surface) 90%, var(--scw-bg)))";
const ACTIVE_GLOW_RECIPE = [
  "0 0 0 1px color-mix(in oklab, var(--scw-active) 70%, white)",
  "0 0 14px color-mix(in oklab, var(--scw-active) 60%, transparent)",
  "0 0 32px color-mix(in oklab, var(--scw-active) 26%, transparent)",
].join(", ");

/** For each color key, the variables it sets. */
const DERIVATIONS = Object.freeze({
  accent: (hex) => ({
    "--scw-accent": hex,
    "--scw-accent-100": mix(hex, 10, "white"),
    "--scw-accent-200": mix(hex, 22, "white"),
    "--scw-accent-300": mix(hex, 42, "white"),
    "--scw-accent-400": mix(hex, 70, "white"),
    "--scw-accent-700": mix(hex, 65, "black"),
    "--scw-accent-800": mix(hex, 45, "black"),
    "--scw-accent-900": mix(hex, 25, "black"),
    "--scw-hp-fill": mix(hex, 70, "white"),
    // a theme with a filled primary button would otherwise draw accent text on an accent fill
    "--scw-btn-primary-text": hex,
    "--scw-btn-primary-bg": "transparent",
    "--scw-btn-primary-border": hex,
  }),
  background: (hex) => ({
    "--scw-bg": hex,
  }),
  surface: (hex) => ({
    "--scw-surface": hex,
    "--scw-surface-bg": SURFACE_RECIPE,
  }),
  text: (hex) => ({
    "--scw-text": hex,
    "--scw-text-muted": mix(hex, 70, "var(--scw-bg)"),
    "--scw-divider": mix(hex, 16, "transparent"),
  }),
  friendly: (hex) => ({ "--scw-friendly": hex }),
  neutral: (hex) => ({ "--scw-neutral": hex }),
  hostile: (hex) => ({ "--scw-hostile": hex }),
  secret: (hex) => ({ "--scw-secret": hex }),
  active: (hex) => ({
    "--scw-active": hex,
    "--scw-active-glow": ACTIVE_GLOW_RECIPE,
  }),
});

/** True for a "#rrggbb" color, in either case. */
export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * The inline variables for `colors` ({ accent: "#rrggbb", text: "", ... }).
 * Empty, missing and invalid values keep the theme's own color.
 */
export function colorOverrides(colors) {
  const out = {};
  for (const key of COLOR_KEYS) {
    const value = colors?.[key];
    if (isHexColor(value)) Object.assign(out, DERIVATIONS[key](value.toLowerCase()));
  }
  return out;
}

/** Every variable colorOverrides can set, so the caller can clear stale ones. */
export const OVERRIDE_PROPERTIES = Object.freeze(
  COLOR_KEYS.flatMap((key) => Object.keys(DERIVATIONS[key]("#000000"))),
);
