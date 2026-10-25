/**
 * Style tweaks over any theme (RF-98): the choices of each tweak, and the
 * --scw-* variables a set of choices sets on the widget root. "theme" keeps
 * the theme's own value. Pure: no Foundry globals.
 */
export const STYLE_CHOICES = Object.freeze({
  font: Object.freeze(["theme", "sans", "serif", "display", "futuristic", "mono"]),
  corners: Object.freeze(["theme", "sharp", "soft", "round"]),
  panels: Object.freeze(["theme", "solid", "translucent", "glass"]),
  rim: Object.freeze(["theme", "thin", "normal", "thick"]),
  names: Object.freeze(["theme", "normal", "uppercase"]),
  buttons: Object.freeze(["theme", "outline", "filled"]),
});

/** Font stacks of faces Foundry itself ships (theme-fonts.css names them for us), then system fallbacks. */
const FONTS = Object.freeze({
  sans: '"Signika", "Segoe UI", system-ui, sans-serif',
  serif: '"Amiri", "SCW Amiri", Georgia, "Times New Roman", serif',
  display: '"Modesto Condensed", "SCW Modesto Condensed", Georgia, serif',
  futuristic: '"Bruno Ace", "SCW Bruno Ace", "Segoe UI", sans-serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
});

const CORNERS = Object.freeze({
  sharp: { "--scw-radius": "2px", "--scw-radius-sm": "1px", "--scw-radius-lg": "3px" },
  soft: { "--scw-radius": "8px", "--scw-radius-sm": "4px", "--scw-radius-lg": "14px" },
  round: { "--scw-radius": "14px", "--scw-radius-sm": "8px", "--scw-radius-lg": "22px" },
});

const PANELS = Object.freeze({
  solid: { "--scw-surface-bg": "var(--scw-surface)", "--scw-surface-blur": "none" },
  translucent: { "--scw-surface-bg": "color-mix(in srgb, var(--scw-surface) 78%, transparent)", "--scw-surface-blur": "none" },
  glass: { "--scw-surface-bg": "color-mix(in srgb, var(--scw-surface) 55%, transparent)", "--scw-surface-blur": "blur(10px)" },
});

const RIMS = Object.freeze({ thin: "2px", normal: "3px", thick: "5px" });

const BUTTONS = Object.freeze({
  outline: { "--scw-btn-primary-bg": "transparent", "--scw-btn-primary-text": "var(--scw-accent)", "--scw-btn-primary-border": "var(--scw-accent)" },
  filled: { "--scw-btn-primary-bg": "var(--scw-accent)", "--scw-btn-primary-text": "var(--scw-bg)", "--scw-btn-primary-border": "var(--scw-accent)" },
});

/**
 * The variables to set inline for `style` ({ font, corners, panels, rim,
 * names, buttons }); unknown or "theme" values set nothing. (Outline and
 * shadow left with RF-115: every theme now derives them from its palette.)
 */
export function styleOverrides(style = {}) {
  const out = {};
  const pick = (table, key) => Object.assign(out, table[style[key]] ?? {});
  if (FONTS[style.font]) {
    out["--scw-font-name"] = FONTS[style.font];
    out["--scw-font-title"] = FONTS[style.font];
  }
  pick(CORNERS, "corners");
  pick(PANELS, "panels");
  if (RIMS[style.rim]) out["--scw-rim-width"] = RIMS[style.rim];
  if (style.names === "normal" || style.names === "uppercase") out["--scw-name-transform"] = style.names === "normal" ? "none" : "uppercase";
  pick(BUTTONS, "buttons");
  return out;
}

/** Every property styleOverrides() can set, so stale ones can be removed. */
export const STYLE_PROPERTIES = Object.freeze([
  ...new Set([
    "--scw-font-name",
    "--scw-font-title",
    "--scw-rim-width",
    "--scw-name-transform",
    ...[CORNERS, PANELS, BUTTONS].flatMap((table) => Object.values(table).flatMap((vars) => Object.keys(vars))),
  ]),
]);
