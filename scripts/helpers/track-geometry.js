import { BAR_MIN_WIDTH, TRACK_SHAPES, TRACK_SIZES } from "../constants/module-constants.js";
import { OVERVIEW_GRID, SQUARE_RADIUS, anchorOffset } from "./wheel-geometry.js";
import { isSideOrientation } from "./orientation.js";

/** Room between the bar and the cards. */
const CARD_LIFT = 8;
export const MIN_REACH = 2;
export const MAX_REACH = 6;
export const MIN_SPACING = -16;
export const MAX_SPACING = 24;
const DEFAULT_SPACING = 8;

/**
 * How a card looks `d` turns away from the acting one (d = 0), per card view
 * (RF-90). Carousel: flat cards of one size, the acting card grows. Slider:
 * each step away is smaller and every side card is turned toward the acting one.
 */
const STYLES = Object.freeze({
  carousel: { scale: (d) => (d === 0 ? 1.25 : 1), tilt: () => 0 },
  slider: { scale: (d) => (d === 0 ? 1.3 : 0.95 * 0.86 ** (d - 1)), tilt: (d) => (d === 0 ? 0 : 30) },
});

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const px = (value) => `${value.toFixed(1)}px`;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Distance along the bar from the acting card's centre to the centre of each
 * card `d` steps away, `spacing` px apart (negative spacing overlaps them).
 */
function centerOffsets(style, along, spacing, count) {
  const offsets = [0];
  let edge = (along * style.scale(0)) / 2;
  for (let d = 1; d <= count; d++) {
    const width = along * style.scale(d) * Math.cos(toRadians(style.tilt(d)));
    const center = edge + spacing + width / 2;
    offsets.push(center);
    edge = center + width / 2;
  }
  return offsets;
}

/** A point `along` the bar and `out` away from it, in the widget's own pixels around its anchor. */
function onScreen(orientation, along, out) {
  switch (orientation) {
    case "down":
      return { x: along, y: out };
    case "right":
      return { x: out, y: along };
    case "left":
      return { x: -out, y: along };
    default:
      return { x: along, y: -out };
  }
}

/**
 * Everything the renderer needs to draw a card view, computed once per layout
 * change. It shares the window of the wheel (`V`, `HW`, `M`, `offset`, see
 * windowSlots), so turning, recycling and the overview work the same way; only
 * the pose of each window position differs. Cards run left to right along a
 * horizontal bar and top to bottom along a side rail, so the next turn always
 * reads forward, and they always stand upright. `poses[position + HW]` is the
 * pose of window position `position` (the acting card sits at `offset`).
 */
export function trackLayout({ view, size, shape, reach, spacing = DEFAULT_SPACING, anchor = "middle", orientation = "up" }) {
  const style = STYLES[view] ?? STYLES.carousel;
  const side = TRACK_SIZES[size] ?? TRACK_SIZES.medium;
  const proportions = TRACK_SHAPES[shape] ?? TRACK_SHAPES.square;
  const cardWidth = Math.round(side * proportions.width);
  const cardHeight = Math.round(side * proportions.height);
  const V = clamp(Math.round(Number(reach) || 3), MIN_REACH, MAX_REACH);
  const HW = V + 1;
  const offset = anchorOffset(anchor, V);
  const vertical = isSideOrientation(orientation);
  // Along a side rail a card's height runs with the bar.
  const along = vertical ? cardHeight : cardWidth;
  const out = vertical ? cardWidth : cardHeight;
  const gap = CARD_LIFT;
  const gapBetween = clamp(Number.isFinite(Number(spacing)) ? Number(spacing) : DEFAULT_SPACING, MIN_SPACING, MAX_SPACING);

  const offsets = centerOffsets(style, along, gapBetween, HW + Math.abs(offset));
  const alongOf = (k) => Math.sign(k) * offsets[Math.abs(k)];
  const halfAlong = (k) => (along * style.scale(Math.abs(k))) / 2;
  // The visible cards are centred on the anchor.
  const first = -V - offset;
  const last = V - offset;
  const low = alongOf(first) - halfAlong(first);
  const high = alongOf(last) + halfAlong(last);
  const base = -(low + high) / 2;

  const poses = [];
  for (let position = -HW; position <= HW; position++) {
    const k = position - offset;
    const d = Math.abs(k);
    const scale = style.scale(d);
    const center = onScreen(orientation, base + alongOf(k), gap + (out * scale) / 2);
    // Side cards turn their face toward the acting one.
    const tilt = -Math.sign(k) * style.tilt(d) || 0;
    const turn = vertical ? `rotateX(${-tilt || 0}deg)` : `rotateY(${tilt}deg)`;
    poses.push({
      center,
      scale,
      z: 100 - d,
      transform: `translate(${px(center.x - cardWidth / 2)}, ${px(center.y - cardHeight / 2)}) scale(${scale.toFixed(3)}) ${turn}`,
    });
  }

  const maxScale = style.scale(0);
  const across = (high - low) / 2;
  // The overview flies tiles out of this square, so it must hold its biggest tile too.
  const Rm = Math.ceil(Math.max(Math.max(cardWidth, cardHeight) * maxScale, OVERVIEW_GRID.tile) / 2);
  return {
    view: STYLES[view] ? view : "carousel",
    shape: "square",
    cardWidth,
    cardHeight,
    V,
    HW,
    M: 2 * HW + 1,
    offset,
    step: 0,
    poses,
    focus: poses[offset + HW].center,
    depth: gap + out * maxScale,
    across,
    barWidth: Math.max(Math.ceil(2 * across), BAR_MIN_WIDTH),
    Rm,
    S: 2 * Rm,
  };
}

/** The pose of window position `position`; positions past the edge keep the edge pose. */
export function trackPose(layout, position) {
  const clamped = Math.min(Math.max(position, -layout.HW), layout.HW);
  return layout.poses[clamped + layout.HW];
}

/**
 * The clip-path of a card at `scale`, centred in the layout's S × S square, of
 * the same kind as the overview's square tiles so the flight interpolates.
 */
export function cardClip(layout, scale) {
  const { S, cardWidth, cardHeight } = layout;
  const x = (S - cardWidth * scale) / 2;
  const y = (S - cardHeight * scale) / 2;
  return `inset(${px(y)} ${px(x)} ${px(y)} ${px(x)} round ${SQUARE_RADIUS}px)`;
}
