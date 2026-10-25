/**
 * RF-115: colour maths for the appearance editor — a whole palette from one
 * colour, and the WCAG contrast that warns when text would be hard to read.
 * OKLCH keeps a hue looking like itself while its lightness changes.
 */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** "#rrggbb" → [r, g, b] in 0–1, or null. */
export function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
}

export function rgbToHex(rgb) {
  return `#${rgb.map((channel) => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** A computed CSS colour ("rgb(…)", "rgba(…)" or "color(srgb …)") → [r, g, b] in 0–1, or null. */
export function parseCssColor(text) {
  const value = String(text ?? "").trim();
  let match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  if (match) return match.slice(1, 4).map((channel) => Number(channel) / 255);
  match = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(value);
  if (match) return match.slice(1, 4).map(Number);
  return hexToRgb(value);
}

function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180) / Math.PI];
}

function oklchToRgb([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma);
}

/** The colour at L, C, H, its chroma lowered until it fits the screen's gamut. */
function oklchHex(L, C, H) {
  let chroma = C;
  for (let step = 0; step < 40; step++) {
    const rgb = oklchToRgb([L, chroma, H]);
    if (rgb.every((channel) => channel >= -0.001 && channel <= 1.001)) return rgbToHex(rgb);
    chroma *= 0.9;
  }
  return rgbToHex(oklchToRgb([L, 0, H]));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours (hex or [r, g, b]), 1–21. */
export function contrastRatio(first, second) {
  const a = Array.isArray(first) ? first : hexToRgb(first);
  const b = Array.isArray(second) ? second : hexToRgb(second);
  if (!a || !b) return 21;
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * A palette from one colour: ground and surface in its hue, text nearly white
 * (or nearly black) tinted by it, and the colour itself as the accent, moved
 * in lightness only until it reads on the surface (3:1; the text gets 4.5:1).
 * @param {string} seed   "#rrggbb"
 * @param {"dark"|"light"} [mode]
 * @returns {{ accent: string, background: string, surface: string, text: string } | null}
 */
export function paletteFromColor(seed, mode = "dark") {
  const rgb = hexToRgb(seed);
  if (!rgb) return null;
  const [L, C, H] = rgbToOklch(rgb);
  const light = mode === "light";
  const background = light ? oklchHex(0.95, Math.min(C * 0.12, 0.02), H) : oklchHex(0.16, Math.min(C * 0.15, 0.025), H);
  const surface = light ? oklchHex(0.985, Math.min(C * 0.06, 0.01), H) : oklchHex(0.22, Math.min(C * 0.2, 0.035), H);
  const text = light ? oklchHex(0.24, Math.min(C * 0.2, 0.03), H) : oklchHex(0.95, Math.min(C * 0.1, 0.012), H);
  let accentL = L;
  let accent = oklchHex(accentL, C, H);
  for (let step = 0; step < 50 && contrastRatio(accent, surface) < 3; step++) {
    accentL = clamp(accentL + (light ? -0.02 : 0.02), 0.05, 0.95);
    accent = oklchHex(accentL, C, H);
  }
  return { accent, background, surface, text };
}
