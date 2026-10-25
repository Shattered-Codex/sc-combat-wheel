/**
 * RF-109: how the camera travels to a token — at a pace in canvas pixels per
 * second, so a near token comes quickly and a far one glides, always between
 * a shortest and a longest time.
 */
export const CAMERA_PANS = Object.freeze({
  fast: { speed: 3000, min: 250, max: 700 },
  smooth: { speed: 1500, min: 450, max: 1300 },
  slow: { speed: 800, min: 700, max: 2200 },
});

/** Milliseconds to travel `distance` canvas pixels at `pace` (a CAMERA_PANS key; unknown ones are smooth). */
export function panDuration(distance, pace) {
  const { speed, min, max } = CAMERA_PANS[pace] ?? CAMERA_PANS.smooth;
  const travel = Math.max(0, Number(distance) || 0);
  return Math.round(Math.min(max, Math.max(min, (travel * 1000) / speed)));
}
