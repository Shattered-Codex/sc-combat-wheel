/**
 * RF-116: the tongues of the "flames" and "inferno" auras, after the SC Item
 * Rarity Colors' frame flames: each one rooted on an outline, pointing
 * outward and leaning up, flickering at its own pace. Described once as CSS
 * custom properties; styles/effects.css animates them. Pure: no DOM, no
 * Foundry globals.
 *
 * Outlines: "round" is the circle inscribed in the box (the acting slice, the
 * wheel's rim), limited to `arc` (screen degrees, 0 = right, 90 = down);
 * "card" is the box's rectangle. Positions are fractions of the box, so the
 * tongues follow it when it is resized without being rebuilt.
 */

export const FLAME_STYLES = Object.freeze(["flames", "inferno"]);

/** How far up each style leans (0 straight out, 1 straight up) and how its tongues reach and flicker. */
const STYLES = Object.freeze({
  flames: Object.freeze({ lean: 0.35, reach: [0.3, 0.6], duration: [0.9, 1.9] }),
  inferno: Object.freeze({ lean: 0.8, reach: [0.4, 0.8], duration: [0.5, 1.15] }),
});

/** Pixels of outline per tongue, and the most and fewest tongues an outline gets. */
const SPACING = 22;
const COUNT_LIMITS = Object.freeze([10, 44]);
const REACH_LIMITS = Object.freeze([18, 72]);
const UP = 270;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toRadians = (degrees) => (degrees * Math.PI) / 180;
/** Shortest signed turn from angle `from` to `to`, in degrees. */
const turnBetween = (from, to) => ((to - from + 540) % 360) - 180;

/** The outline's length in px, which sets how many tongues it carries. */
function outlineLength({ shape, width, height, arc }) {
  if (shape === "card") return 2 * (width + height);
  const span = Math.abs(arc[1] - arc[0]);
  return (Math.PI * Math.min(width, height) * span) / 360;
}

/** A point of the outline (box fractions) and the outward direction there. */
function outlinePoint({ shape, width, height, arc }, random) {
  if (shape !== "card") {
    const angle = arc[0] + random() * (arc[1] - arc[0]);
    const radians = toRadians(angle);
    return { x: 0.5 + 0.5 * Math.cos(radians), y: 0.5 + 0.5 * Math.sin(radians), normal: angle, bottom: Math.sin(radians) > 0.7 };
  }
  // Edges picked by length, so wide and tall boxes are covered evenly.
  let roll = random() * 2 * (width + height);
  const along = random();
  if (roll < width) return { x: along, y: 0, normal: 270, bottom: false };
  roll -= width;
  if (roll < width) return { x: along, y: 1, normal: 90, bottom: true };
  roll -= width;
  if (roll < height) return { x: 0, y: along, normal: 180, bottom: false };
  return { x: 1, y: along, normal: 0, bottom: false };
}

/**
 * @param {object} options
 * @param {"round"|"card"} options.shape
 * @param {number} options.width  box width in px
 * @param {number} options.height box height in px
 * @param {[number, number]} [options.arc]  the part of a round outline that carries tongues
 * @param {string} [options.style]  one of FLAME_STYLES
 * @param {number} [options.scale]  reach multiplier (FX_BOOST)
 * @param {() => number} [options.random]  source in [0, 1); seed it for stable output
 * @returns {Record<string, string>[]} one set of custom properties per tongue
 */
export function flameTongues({ shape = "round", width, height, arc = [0, 360], style = "flames", scale = 1, random = Math.random } = {}) {
  const box = { shape, width: Math.max(1, width || 0), height: Math.max(1, height || 0), arc };
  const tuning = STYLES[style] ?? STYLES.flames;
  const between = (min, max) => min + random() * (max - min);
  const count = Math.round(clamp(outlineLength(box) / SPACING, ...COUNT_LIMITS));
  const size = Math.min(box.width, box.height);
  const tongues = [];
  for (let index = 0; index < count; index += 1) {
    const point = outlinePoint(box, random);
    const angle = point.normal + turnBetween(point.normal, UP) * tuning.lean + between(-12, 12);
    // Those pointing down stay short: the bar or the hub lies there.
    const reach = clamp(size * between(...tuning.reach), ...REACH_LIMITS) * scale * (point.bottom ? 0.55 : 1);
    const duration = between(...tuning.duration);
    tongues.push({
      "--x": point.x.toFixed(4),
      "--y": point.y.toFixed(4),
      "--n": `${angle.toFixed(1)}deg`,
      "--n2": `${(angle + between(-14, 14)).toFixed(1)}deg`,
      "--len": `${reach.toFixed(0)}px`,
      "--w": `${(reach * between(0.55, 0.9)).toFixed(0)}px`,
      "--t": `${duration.toFixed(2)}s`,
      "--delay": `${(-between(0, duration * 2)).toFixed(2)}s`,
    });
  }
  return tongues;
}

/** The half of the wheel's rim that shows past the bar, per direction (screen degrees). */
const ARC_BY_SIDE = Object.freeze({ up: [180, 360], down: [0, 180], left: [90, 270], right: [-90, 90] });

/** The arc of a round outline that carries tongues: all of it, or the side the portraits are on. */
export function flameArc(side) {
  return ARC_BY_SIDE[side] ?? [0, 360];
}
