import { BAR_MIN_WIDTH, DEFAULT_PRESET, LAYOUT_PRESETS, TIMING } from "../constants/module-constants.js";

/** Points per arc; the grid square reuses the same count so clip-path can interpolate. */
export const ARC_POINTS = 9;

/** Always-positive modulo, so negative sequences map onto the ring. */
export function mod(n, m) {
  return ((n % m) + m) % m;
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const px = (value) => `${value.toFixed(1)}px`;

/** Corner radius of square portraits (SPEC §6, "Quadrados"). */
export const SQUARE_RADIUS = 8;
/** The active square grows by this factor, outward from the hub. */
const ACTIVE_SQUARE_GROWTH = 1.18;

/**
 * Where the turn sits in a window of 2V+1 positions: "middle" in the centre,
 * "left" (the start) on the first whole position with one past turn before it,
 * "end" on the last one with one turn to come after it.
 */
export function anchorOffset(anchor, V) {
  if (anchor === "left") return 1 - V;
  if (anchor === "end") return V - 1;
  return 0;
}

/**
 * Everything the renderer needs from a preset, computed once per layout change.
 * `anchor` places the turn (see anchorOffset). `shape` is "sector" or "square" (a preset may impose one);
 * `gap` overrides the preset's angle between slices, in degrees.
 */
export function layoutFor(preset, anchor = "middle", { shape = preset.shape ?? "sector", gap = preset.gap } = {}) {
  const { R, r0, E, step } = preset;
  const V = Math.floor(90 / step);
  const HW = V + 2;
  const Rm = R + E;
  const half = step / 2 - gap / 2;
  const layout = {
    view: "wheel",
    R,
    r0,
    E,
    step,
    gap,
    shape: shape === "square" ? "square" : "sector",
    V,
    HW,
    M: 2 * HW + 1,
    Rm,
    S: 2 * Rm,
    // How far the widget reaches from its anchor, away from the bar and along it.
    depth: Rm,
    across: Rm,
    half,
    hubR: r0 - 10,
    barWidth: Math.max(2 * R, BAR_MIN_WIDTH),
    offset: anchorOffset(anchor, V),
  };
  return layout.shape === "square" ? withSquares(layout) : withSectors(layout);
}

/** Sector slices: the portrait fills the slice; the rim is a circle clipped by it. */
function withSectors(layout) {
  const { R, r0, E, Rm } = layout;
  const circle = (radius) => ({ left: Rm - radius, top: Rm - radius, width: 2 * radius, height: 2 * radius, radius: "50%" });
  const portrait = portraitBox(layout);
  return {
    ...layout,
    portrait,
    activePortrait: portrait,
    sector: sectorPolygon(layout, R, r0),
    activeSector: sectorPolygon(layout, R + E, r0 - 4),
    rim: circle(R),
    activeRim: circle(R + E),
  };
}

/**
 * Rounded squares following the arc: sized so depth equals arc width, which
 * keeps square token art uncut (SPEC §6).
 */
function withSquares(layout) {
  const { R, r0, Rm, S, half } = layout;
  const middle = (R + r0) / 2;
  const normal = Math.min(R - r0, 2 * middle * Math.sin(toRadians(half)));
  const tile = (size) => ({ left: Rm - size / 2, top: Rm - middle - size / 2 - (size - normal) / 2, size });
  const rimOf = ({ left, top, size }) => ({ left, top, width: size, height: size, radius: `${SQUARE_RADIUS}px` });
  const portrait = tile(normal);
  const activePortrait = tile(normal * ACTIVE_SQUARE_GROWTH);
  return {
    ...layout,
    portrait,
    activePortrait,
    sector: insetClip(S, portrait),
    activeSector: insetClip(S, activePortrait),
    rim: rimOf(portrait),
    activeRim: rimOf(activePortrait),
  };
}

function insetClip(S, { left, top, size }) {
  return `inset(${px(top)} ${px(S - left - size)} ${px(S - top - size)} ${px(left)} round ${SQUARE_RADIUS}px)`;
}

/**
 * The clip-path of a grid cell of side `size`, of the same kind as the slice
 * clip so the browser can interpolate between them.
 */
export function gridClip(layout, size) {
  if (layout.shape !== "square") return squarePolygon(layout, size);
  return insetClip(layout.S, { left: layout.Rm - size / 2, top: layout.Rm - size / 2, size });
}

/**
 * Which sequence each of the M stable slots shows for absolute turn T (Appendix A).
 * Slot `i` always holds the sequence `s ≡ i (mod M)` inside the window, so a
 * one-step turn only moves one slot from one edge to the other.
 */
export function windowSlots({ T, N, layout }) {
  const { M, HW, V, offset, step } = layout;
  const low = T - offset - HW;
  const slots = [];
  for (let index = 0; index < M; index++) {
    const s = low + mod(index - low, M);
    const k = s - T;
    const position = k + offset;
    const present = N > 0 && s >= 0;
    slots.push({
      index,
      s,
      k,
      position,
      angle: position * step,
      combatantIndex: present ? mod(s, N) : null,
      round: present ? Math.floor(s / N) + 1 : null,
      visible: present && Math.abs(position) <= V,
      past: k < 0,
      active: k === 0,
      edge: Math.abs(position) === HW,
    });
  }
  return slots;
}

/** A ring sector centred on 12 o'clock, as a clip-path polygon of 2 × ARC_POINTS points. */
export function sectorPolygon(layout, outerRadius, innerRadius) {
  const { Rm, half } = layout;
  const point = (theta, radius) =>
    `${px(Rm + radius * Math.sin(toRadians(theta)))} ${px(Rm - radius * Math.cos(toRadians(theta)))}`;
  const last = ARC_POINTS - 1;
  const points = [];
  for (let i = 0; i <= last; i++) points.push(point(-half + (2 * half * i) / last, outerRadius));
  for (let i = last; i >= 0; i--) points.push(point(-half + (2 * half * i) / last, innerRadius));
  return `polygon(${points.join(", ")})`;
}

/** The square the portrait image fills inside an unrotated slice. */
export function portraitBox({ Rm, r0, half }) {
  const width = 2 * Rm * Math.sin(toRadians(half));
  const height = Rm - r0 * Math.cos(toRadians(half));
  const size = Math.max(width, height);
  return { left: Rm - size / 2, top: height / 2 - size / 2, size };
}

/**
 * How to get from the displayed turn to the new one (SPEC §9).
 * `speed` is the animation multiplier; 0 means animation is off.
 */
export function stepPlan(fromT, toT, { speed = 1, reducedMotion = false } = {}) {
  const delta = toT - fromT;
  if (delta === 0) return { mode: "none", steps: [], duration: 0 };
  if (!speed || reducedMotion) return { mode: "fade", steps: [toT], duration: TIMING.fade };

  const count = Math.abs(delta);
  const direction = Math.sign(delta);
  if (count === 1) return { mode: "rotate", steps: [toT], duration: TIMING.singleStep * speed };
  if (count * TIMING.jumpStep > TIMING.jumpBudget) {
    return { mode: "fade", steps: [toT], duration: TIMING.fade };
  }
  const steps = Array.from({ length: count }, (_, i) => fromT + direction * (i + 1));
  return { mode: "rotate", steps, duration: TIMING.jumpStep * speed };
}

/** Signed ring distance from `from` to `to`, the short way round (|d| ≤ N/2). */
export function shortestOffset(from, to, N) {
  if (!N) return 0;
  const forward = mod(to - from, N);
  return forward > N / 2 ? forward - N : forward;
}

/**
 * A square of side `size` centred in the slice box, drawn with the same
 * 2 × ARC_POINTS points as a sector (top edge left→right, bottom edge
 * right→left), so clip-path interpolates sector ⇄ square directly (Appendix A).
 */
export function squarePolygon({ Rm }, size) {
  const left = Rm - size / 2;
  const top = Rm - size / 2;
  const last = ARC_POINTS - 1;
  const points = [];
  for (let i = 0; i <= last; i++) points.push(`${px(left + (size * i) / last)} ${px(top)}`);
  for (let i = last; i >= 0; i--) points.push(`${px(left + (size * i) / last)} ${px(top + size)}`);
  return `polygon(${points.join(", ")})`;
}

/** Grid cell metrics at full size; the grid shrinks to fit the room it has. */
export const GRID = Object.freeze({ tile: 72, cellWidth: 82, cellHeight: 96, header: 40, padding: 12 });

/** The full-screen overview (RF-20) floats bigger portraits, with room for "+" between them. */
export const OVERVIEW_GRID = Object.freeze({ tile: 104, cellWidth: 144, cellHeight: 150, maxCols: 10 });

/**
 * The "see everyone" grid (RF-20): columns grow with N, and the whole grid
 * scales down when it would not fit `maxWidth` × `maxHeight`.
 * Cell centres are relative to the grid's top-left corner.
 */
export function gridLayout({ N, maxWidth = Infinity, maxHeight = Infinity, metrics = GRID }) {
  const maxCols = metrics.maxCols ?? 8;
  const byWidth = Number.isFinite(maxWidth) ? Math.max(1, Math.floor(maxWidth / metrics.cellWidth)) : maxCols;
  const cols = Math.max(1, Math.min(N, maxCols, Math.max(4, Math.min(byWidth, Math.ceil(Math.sqrt(N * 1.5))))));
  const rows = Math.max(1, Math.ceil(N / cols));
  const scale = Math.min(1, maxWidth / (cols * metrics.cellWidth), maxHeight / (rows * metrics.cellHeight));
  const cellWidth = metrics.cellWidth * scale;
  const cellHeight = metrics.cellHeight * scale;
  const tile = metrics.tile * scale;
  const cells = Array.from({ length: N }, (_, i) => ({
    x: (i % cols) * cellWidth + cellWidth / 2,
    y: Math.floor(i / cols) * cellHeight + tile / 2,
  }));
  return { cols, rows, scale, tile, cellWidth, cellHeight, width: cols * cellWidth, height: rows * cellHeight, cells };
}

/** SPEC §6: the custom layout warns past this depth-to-width ratio (either way). */
export const MAX_PORTRAIT_RATIO = 1.4;

/**
 * A custom preset from the user's radii and slice angle. The slice angle is
 * clamped to 15–45° and the inner radius kept at least 40 px inside the outer.
 */
export function customPreset({ outer, inner, step }) {
  const R = Math.min(Math.max(Math.round(outer), 100), 400);
  const r0 = Math.min(Math.max(Math.round(inner), 50), R - 40);
  return { R, r0, E: Math.round(R * 0.075), step: Math.min(Math.max(step, 15), 45), gap: 0.8 };
}

/**
 * Slice depth over arc width at the middle radius. Near 1 the portrait is
 * almost square; the editor warns beyond MAX_PORTRAIT_RATIO.
 */
export function portraitRatio({ R, r0, step }) {
  const middle = (R + r0) / 2;
  return (R - r0) / (2 * middle * Math.sin(toRadians(step / 2)));
}

export function isPortraitRatioOk(preset) {
  const ratio = portraitRatio(preset);
  return ratio <= MAX_PORTRAIT_RATIO && ratio >= 1 / MAX_PORTRAIT_RATIO;
}

/** The preset a set of layout settings names, including the custom one. */
export function presetFromSettings({ layoutPreset, customOuter, customInner, customStep }) {
  if (layoutPreset !== "custom") return LAYOUT_PRESETS[layoutPreset] ?? LAYOUT_PRESETS[DEFAULT_PRESET];
  return customPreset({ outer: customOuter, inner: customInner, step: customStep });
}

/**
 * The box the widget covers around its anchor, unscaled: the wheel or the
 * cards (`depth` deep) on one side, the bar (`barThickness` deep) on the other,
 * the longer of the two across. Takes any view's layout. Used to fit the
 * appearance preview.
 */
export function widgetBounds({ depth, across, barWidth }, orientation, barThickness) {
  const half = Math.max(across, barWidth / 2);
  switch (orientation) {
    case "down":
      return { minX: -half, maxX: half, minY: -barThickness, maxY: depth };
    case "right":
      return { minX: -barThickness, maxX: depth, minY: -half, maxY: half };
    case "left":
      return { minX: -depth, maxX: barThickness, minY: -half, maxY: half };
    default:
      return { minX: -half, maxX: half, minY: -depth, maxY: barThickness };
  }
}
