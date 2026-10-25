/**
 * Decorative particles around the wheel: what each particle type looks like
 * (shape mix), how it moves (motion), and one randomized path per particle.
 *
 * Every particle is described once as CSS custom properties (size, opacity,
 * lifetime, phase, three path points and rotations, plus a palette slot and a
 * sway width for the shapes and motions that use them); styles/particles.css
 * animates them with transform, translate and opacity only. Coordinates are pixels from
 * the centre of the emitter box. Pure: no DOM, no Foundry globals.
 */

export const PARTICLE_TYPES = Object.freeze([
  "none", "embers", "arcane", "stardust", "frost", "shadow", "fireflies", "petals", "bubbles", "sparks",
  "snow", "rain", "leaves", "ash", "motes", "confetti", "runes", "wisps",
]);

export const PARTICLE_AMOUNTS = Object.freeze({ few: 8, normal: 14, many: 24 });

/** Multiplies every particle's lifetime (higher is slower). */
export const PARTICLE_SPEEDS = Object.freeze({ slow: 1.6, normal: 1, fast: 0.6 });

/** Scales every particle's peak opacity. */
export const PARTICLE_INTENSITIES = Object.freeze({ subtle: 0.45, normal: 0.75, strong: 1 });

/** RF-111: one "intensity" setting sets both how many particles there are and how bright they get. */
export const INTENSITY_AMOUNTS = Object.freeze({ subtle: "few", normal: "normal", strong: "many" });

/**
 * Per type: weighted shape mix, motion, and the scale a particle ends at
 * (petals and bubbles keep their size longer).
 */
export const PARTICLE_PRESETS = Object.freeze({
  embers: Object.freeze({ shapes: [["dot", 70], ["spark", 30]], motion: "rise" }),
  arcane: Object.freeze({ shapes: [["dot", 55], ["spark", 25], ["diamond", 20]], motion: "swirl" }),
  stardust: Object.freeze({ shapes: [["dot", 50], ["star", 50]], motion: "twinkle" }),
  frost: Object.freeze({ shapes: [["flake", 55], ["diamond", 25], ["dot", 20]], motion: "fall" }),
  shadow: Object.freeze({ shapes: [["blob", 100]], motion: "rise" }),
  fireflies: Object.freeze({ shapes: [["glow", 100]], motion: "wander" }),
  petals: Object.freeze({ shapes: [["petal", 100]], motion: "fall", endScale: 0.75 }),
  bubbles: Object.freeze({ shapes: [["bubble", 100]], motion: "rise", endScale: 0.9 }),
  sparks: Object.freeze({ shapes: [["spark", 80], ["dot", 20]], motion: "burst" }),
  snow: Object.freeze({ shapes: [["snow", 100]], motion: "drift", endScale: 0.8 }),
  rain: Object.freeze({ shapes: [["streak", 100]], motion: "rain", endScale: 1 }),
  leaves: Object.freeze({ shapes: [["leaf", 100]], motion: "drift", endScale: 0.85 }),
  ash: Object.freeze({ shapes: [["ash", 100]], motion: "float", endScale: 0.6 }),
  motes: Object.freeze({ shapes: [["mote", 100]], motion: "hover", endScale: 0.6 }),
  confetti: Object.freeze({ shapes: [["confetti", 100]], motion: "fall", endScale: 0.9 }),
  runes: Object.freeze({ shapes: [["rune1", 25], ["rune2", 25], ["rune3", 25], ["rune4", 25]], motion: "orbit", endScale: 0.6 }),
  wisps: Object.freeze({ shapes: [["wisp", 100]], motion: "wave", endScale: 0.5 }),
});

// Shapes that turn as they travel, and shapes that point where they go.
const SPINNING = new Set(["petal", "flake", "star", "diamond", "leaf", "ash", "confetti"]);
const ORIENTED = new Set(["spark", "streak"]);

// Shapes whose color comes from a palette slot (--k, an integer 0..5) instead of only the tint.
const PALETTE = new Set(["leaf", "confetti"]);
const PALETTE_SIZE = 6;

// Vertical motions: direction (-1 up, 1 down), random side drift as a share
// of the travel, and whether CSS adds a side-to-side sway (--w) on top.
const VERTICAL = Object.freeze({
  rise: Object.freeze({ up: -1, drift: 0.25 }),
  fall: Object.freeze({ up: 1, drift: 0.25 }),
  float: Object.freeze({ up: -1, drift: 0.35 }),
  drift: Object.freeze({ up: 1, drift: 0.1, sway: true }),
  wave: Object.freeze({ up: -1, drift: 0.1, sway: true }),
});

// The CSS animation class per motion (default "path").
const MOTION_CLASSES = Object.freeze({
  swirl: "spiral",
  orbit: "spiral",
  twinkle: "twinkle",
  drift: "sway",
  wave: "sway",
  hover: "glimmer",
});

// Lifetime range per motion, in seconds (scaled by --scw-fx-speed in CSS).
const DURATIONS = Object.freeze({
  burst: [1.8, 4],
  rise: [3, 6],
  fall: [3.5, 6.5],
  swirl: [3, 5.5],
  twinkle: [1.2, 2.8],
  wander: [4.5, 8],
  drift: [6, 10],
  rain: [0.6, 1.1],
  float: [6, 10],
  hover: [5, 9],
  orbit: [6, 9.5],
  wave: [4.5, 7.5],
});

// Size range per shape, in px.
const SIZES = Object.freeze({
  dot: [2, 4.8],
  spark: [1.4, 2.1],
  diamond: [4, 6.5],
  star: [6, 10],
  flake: [6, 10],
  blob: [10, 18],
  glow: [4, 7],
  petal: [6, 10],
  bubble: [5, 10],
  snow: [3, 6.5],
  streak: [1, 1.6],
  leaf: [7, 11],
  ash: [3, 5.5],
  mote: [1.6, 3.2],
  confetti: [5, 8],
  rune1: [7, 11],
  rune2: [7, 11],
  rune3: [7, 11],
  rune4: [7, 11],
  wisp: [5, 9],
});

// Travel distance comes from the box's shorter side, clamped so a tiny box
// still shows visible motion and a huge one does not fling particles away.
const TRAVEL_SCALE = 0.6;
const TRAVEL_MIN = 28;
const TRAVEL_MAX = 160;
const SIGNATURE_STEP = 8;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const direction = (degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
};
const angleOf = (from, to) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
const px = (value) => `${value.toFixed(2)}px`;
const deg = (value) => `${value.toFixed(1)}deg`;

/** Random helpers bound to one source, so a seeded source gives stable output. */
function randomTools(random) {
  const between = (min, max) => min + random() * (max - min);
  const sign = () => (random() < 0.5 ? -1 : 1);
  const pickWeighted = (entries) => {
    let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [value, weight] of entries) {
      if (roll < weight) return value;
      roll -= weight;
    }
    return entries[entries.length - 1][0];
  };
  return { between, sign, pickWeighted };
}

function normalizeBox(box) {
  const width = Number.isFinite(box?.width) ? Math.max(1, box.width) : 1;
  const height = Number.isFinite(box?.height) ? Math.max(1, box.height) : 1;
  return { width, height };
}

/**
 * One path, as three points (start, middle, end) or a spiral about the box
 * centre. Half-sizes `hw`/`hh` describe the box; `travel` is the distance.
 */
function particlePath(motion, { hw, hh, travel }, rnd) {
  const { between, sign } = rnd;
  const d = travel * between(0.6, 1.2);

  switch (motion) {
    case "rise":
    case "fall":
    case "float":
    case "drift":
    case "wave": {
      // Rising particles start in the lower half and leave upward; falling
      // ones start in the upper half and drift down.
      const { up, drift: share, sway } = VERTICAL[motion];
      const start = [between(-hw, hw), -up * between(0, hh)];
      const side = between(-share, share) * travel;
      return {
        points: [
          start,
          [start[0] + side, start[1] + up * d * 0.55],
          [start[0] - side * 0.6, start[1] + up * d * 1.1],
        ],
        sway: sway ? travel * between(0.1, 0.22) : 0,
      };
    }
    case "rain": {
      // Long straight streaks, all leaning the same way, from above the box.
      const start = [between(-hw, hw * 1.2), between(-hh * 1.2, hh * 0.2)];
      const fall = direction(90 + between(12, 18));
      const length = d * 1.5;
      return {
        points: [
          start,
          [start[0] + fall[0] * length * 0.5, start[1] + fall[1] * length * 0.5],
          [start[0] + fall[0] * length, start[1] + fall[1] * length],
        ],
      };
    }
    case "hover": {
      // A slow, short wander anywhere in the box.
      const step = travel * 0.3;
      const p0 = [between(-hw, hw), between(-hh, hh)];
      const p1 = [p0[0] + between(-step, step), p0[1] + between(-step, step)];
      return { points: [p0, p1, [p1[0] + between(-step, step), p1[1] + between(-step, step)]] };
    }
    case "orbit":
    case "swirl": {
      const ra = Math.min(hw, hh) * between(0.7, 1);
      return { spiral: { a: between(0, 360), arc: sign() * between(90, 170), ra, rb: ra + d * 0.6 } };
    }
    case "twinkle": {
      // Anywhere in the box or just around it; barely moves.
      const p0 = [between(-hw, hw) * 1.1, between(-hh, hh) * 1.1];
      return {
        points: [
          p0,
          [p0[0] + between(-4, 4), p0[1] + between(-4, 4)],
          [p0[0] + between(-6, 6), p0[1] + between(-6, 6)],
        ],
      };
    }
    case "wander": {
      const step = travel * 0.5;
      const p0 = [between(-hw, hw), between(-hh, hh)];
      const p1 = [p0[0] + between(-step, step), p0[1] + between(-step, step)];
      return { points: [p0, p1, [p1[0] + between(-step, step), p1[1] + between(-step, step)]] };
    }
    default: {
      // burst: from the rim of the ellipse inscribed in the box, outward.
      const angle = between(0, 360);
      const rim = direction(angle);
      const start = [rim[0] * hw * 0.85, rim[1] * hh * 0.85];
      const out = direction(angle + between(-30, 30));
      return {
        points: [
          start,
          [start[0] + out[0] * d * 0.5, start[1] + out[1] * d * 0.5],
          [start[0] + out[0] * d, start[1] + out[1] * d],
        ],
      };
    }
  }
}

function particleRotations(shape, path, rnd) {
  if (SPINNING.has(shape)) {
    const start = rnd.between(0, 360);
    const spin = rnd.sign() * rnd.between(90, 320);
    return [start, start + spin * 0.5, start + spin];
  }
  if (ORIENTED.has(shape) && path.points) {
    const [p0, p1, p2] = path.points;
    return [angleOf(p0, p1), angleOf(p0, p1), angleOf(p1, p2)];
  }
  if (ORIENTED.has(shape) && path.spiral) {
    // Tangent to the spiral: 90 degrees off the radius, in the turning direction.
    const turn = path.spiral.arc < 0 ? -90 : 90;
    return [turn, turn, turn];
  }
  return [0, 0, 0];
}

function describeParticle(preset, path, rnd) {
  const { between, pickWeighted } = rnd;
  const shape = pickWeighted(preset.shapes);
  const duration = between(...DURATIONS[preset.motion]);
  const vars = {
    "--s": px(between(...SIZES[shape])),
    "--o": between(0.55, 1).toFixed(2),
    "--t": `${duration.toFixed(2)}s`,
    "--delay": `${(-between(0, duration)).toFixed(2)}s`,
    "--sc2": String(preset.endScale ?? 0.35),
  };
  [vars["--r0"], vars["--r1"], vars["--r2"]] = particleRotations(shape, path, rnd).map(deg);
  if (PALETTE.has(shape)) vars["--k"] = String(Math.floor(between(0, PALETTE_SIZE)));
  if (path.sway) vars["--w"] = px(path.sway * rnd.sign());

  const motionClass = MOTION_CLASSES[preset.motion] ?? "path";
  if (path.spiral) {
    vars["--a"] = deg(path.spiral.a);
    vars["--arc"] = deg(path.spiral.arc);
    vars["--ra"] = px(path.spiral.ra);
    vars["--rb"] = px(path.spiral.rb);
  } else {
    path.points.forEach(([x, y], index) => {
      vars[`--p${index}x`] = px(x);
      vars[`--p${index}y`] = px(y);
    });
  }
  return { className: `scw-fx-pt scw-fx-pm--${motionClass} scw-fx-ps--${shape}`, vars };
}

/**
 * Describes the particles of one emitter.
 * @param {object} options
 * @param {string} options.type - one of PARTICLE_TYPES
 * @param {string} [options.amount] - a key of PARTICLE_AMOUNTS
 * @param {{width: number, height: number}} options.box - emitter size in px
 * @param {() => number} [options.random] - source in [0, 1); seed it for stable output
 * @returns {{className: string, vars: Record<string, string>}[]}
 */
export function buildParticles({ type, amount = "normal", box, random = Math.random } = {}) {
  const preset = PARTICLE_PRESETS[type];
  if (!preset) return [];
  const count = PARTICLE_AMOUNTS[amount] ?? PARTICLE_AMOUNTS.normal;
  const { width, height } = normalizeBox(box);
  const geometry = {
    hw: width / 2,
    hh: height / 2,
    travel: clamp(Math.min(width, height) * TRAVEL_SCALE, TRAVEL_MIN, TRAVEL_MAX),
  };
  const rnd = randomTools(random);
  const particles = [];
  for (let index = 0; index < count; index += 1) {
    particles.push(describeParticle(preset, particlePath(preset.motion, geometry, rnd), rnd));
  }
  return particles;
}

/** Changes only when buildParticles would need to run again. */
export function particleSignature({ type, amount = "normal", box } = {}) {
  if (!PARTICLE_PRESETS[type]) return "none";
  const { width, height } = normalizeBox(box);
  const step = (value) => Math.round(value / SIGNATURE_STEP) * SIGNATURE_STEP;
  const count = PARTICLE_AMOUNTS[amount] ?? PARTICLE_AMOUNTS.normal;
  return `${type}|${count}|${step(width)}x${step(height)}`;
}
