/**
 * Which way the arc opens from the bar (RF-13). The wheel is always drawn as
 * "up" and turned as a whole; the bar lies on the straight side, so on "left"
 * and "right" it stands as a vertical rail.
 */
export const ORIENTATIONS = Object.freeze(["up", "right", "down", "left"]);

/** Clockwise turn from the drawn "up" pose, in degrees; -90 keeps "left" a short way from 0. */
const ROTATION = Object.freeze({ up: 0, right: 90, down: 180, left: -90 });

const OPPOSITE = Object.freeze({ up: "down", right: "left", down: "up", left: "right" });

export function normalizeOrientation(value) {
  return ORIENTATIONS.includes(value) ? value : "up";
}

export function wheelRotation(orientation) {
  return ROTATION[normalizeOrientation(orientation)];
}

/** Arc to a side: the bar becomes a vertical rail. */
export function isSideOrientation(orientation) {
  return orientation === "left" || orientation === "right";
}

/** Where the bar sits (and its details grow): away from the arc. */
export function oppositeOf(orientation) {
  return OPPOSITE[normalizeOrientation(orientation)];
}
