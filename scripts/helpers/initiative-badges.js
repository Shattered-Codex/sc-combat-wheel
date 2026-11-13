/** Local vector masks shared by every initiative badge in a look. No fonts or external assets. */
function mask(content) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${content}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function badge(outline, facets = "") {
  return Object.freeze({
    fill: mask(`<path d="${outline}" fill="white"/>`),
    outline: mask(`<g fill="none" stroke="white" stroke-width="4" stroke-linejoin="round"><path d="${outline}"/>${facets ? `<path d="${facets}" opacity=".4" stroke-width="3"/>` : ""}</g>`),
  });
}

/** Shape names also drive the settings choices; null keeps theme styling or text only. */
export const INITIATIVE_BADGES = Object.freeze({
  theme: null,
  tag: badge("M12 4H88Q96 4 96 12V88Q96 96 88 96H12Q4 96 4 88V12Q4 4 12 4Z"),
  pill: badge("M30 4H70A26 46 0 0 1 70 96H30A26 46 0 0 1 30 4Z"),
  circle: badge("M50 4A46 46 0 1 1 50 96A46 46 0 1 1 50 4Z"),
  square: badge("M4 4H96V96H4Z"),
  diamond: badge("M50 3L97 50 50 97 3 50Z"),
  hexagon: badge("M25 5H75L97 50 75 95H25L3 50Z"),
  shield: badge("M6 5H94V44Q94 76 50 97Q6 76 6 44Z"),
  d4: badge("M50 4L97 94H3Z", "M50 4V68L3 94M50 68L97 94"),
  d6: badge("M50 3L94 25V75L50 97 6 75V25Z", "M6 25L50 47 94 25M50 47V97"),
  d8: badge("M50 3L95 50 50 97 5 50Z", "M50 3L28 50 50 97 72 50 50 3M5 50H95"),
  d10: badge("M50 3L94 36V70L50 97 6 70V36Z", "M50 3L28 62 50 97 72 62 50 3M6 36L28 62H72L94 36M6 70L28 62M72 62L94 70"),
  d12: badge("M50 3L78 12 95 36V64L78 88 50 97 22 88 5 64V36L22 12Z", "M50 24L76 43 66 73H34L24 43ZM50 3V24M95 36L76 43M78 88L66 73M22 88L34 73M5 36L24 43"),
  d20: badge("M50 3L94 26V74L50 97 6 74V26Z", "M50 3L25 66H75L50 3M6 26L25 66 6 74M94 26L75 66 94 74M25 66L50 97 75 66M6 26H94"),
  text: null,
});

/** Where a card's badge sits; "theme" keeps the theme's own place (the top-left corner unless it says otherwise). */
export const INITIATIVE_POSITIONS = Object.freeze(["theme", "top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right"]);

/** Unknown or missing saved choices keep the theme's place. */
export function initiativePosition(value) {
  return INITIATIVE_POSITIONS.includes(value) ? value : "theme";
}

/**
 * Whether a card's round badge and hidden/virtual marks take the line below
 * the initiative: the badge is in the top row and changed from the theme's own
 * (shape, size, number, place or nudge), so it may no longer fit beside them
 * on a narrow card.
 */
export function marksBelowInitiative(look) {
  const position = initiativePosition(look.initiativeBadgePosition);
  if (position.startsWith("bottom")) return false;
  const changed = (key, standard) => (Number(look[key]) || standard) !== standard;
  return position !== "theme"
    || initiativeBadgeAppearance(look.initiativeBadge).shape !== "theme"
    || changed("initiativeBadgeSize", 100) || changed("initiativeBadgeFontSize", 100)
    || changed("initiativeBadgeOffsetX", 0) || changed("initiativeBadgeOffsetY", 0);
}

/** Unknown or missing saved choices retain the theme's original badge. */
export function initiativeBadgeAppearance(value) {
  const shape = Object.hasOwn(INITIATIVE_BADGES, value) ? value : "theme";
  const drawing = INITIATIVE_BADGES[shape];
  return { shape, fill: drawing?.fill ?? "none", outline: drawing?.outline ?? "none" };
}
