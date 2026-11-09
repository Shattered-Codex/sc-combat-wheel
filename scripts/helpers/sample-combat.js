import { DEFAULT_VIRTUAL_IMAGE } from "./virtual-positions.js";
import { healthTone } from "./health-source.js";
import { healthState, initialsOf } from "./visibility-rules.js";
import { mod } from "./wheel-geometry.js";

/**
 * The made-up encounter the appearance preview turns (RF-73), in initiative
 * order. Ten entries, so even the Dense layout keeps some in the hidden half;
 * every look the wheel has shows at least once: each disposition, wounded and
 * critical health, a defeated foe, a virtual position. Portraits are Foundry's
 * own icons.
 */
export const SAMPLE_COMBATANTS = Object.freeze([
  { key: "knight", img: "icons/environment/people/infantry-armored.webp", disposition: "friendly", initiative: 21, hp: [38, 44], owner: true },
  { key: "lair", img: DEFAULT_VIRTUAL_IMAGE, disposition: "neutral", initiative: 20, virtual: true },
  { key: "wolf", img: "icons/creatures/abilities/wolf-howl-moon-purple.webp", disposition: "hostile", initiative: 19, hp: [9, 22] },
  { key: "archer", img: "icons/environment/people/archer.webp", disposition: "friendly", initiative: 17, hp: [16, 30], owner: true },
  { key: "dragon", img: "icons/creatures/abilities/dragon-fire-breath-orange.webp", disposition: "hostile", initiative: 15, hp: [180, 200] },
  { key: "cleric", img: "icons/environment/people/cleric-orange.webp", disposition: "friendly", initiative: 12, hp: [24, 24], owner: true },
  { key: "bandit", img: "icons/environment/people/spearfighter.webp", disposition: "hostile", initiative: 10, hp: [0, 16] },
  { key: "commoner", img: "icons/environment/people/commoner.webp", disposition: "neutral", initiative: 8, hp: [4, 4] },
  { key: "bear", img: "icons/creatures/abilities/bear-roar-bite-brown.webp", disposition: "hostile", initiative: 6, hp: [5, 34] },
  { key: "lion", img: "icons/creatures/abilities/lion-roar-yellow.webp", disposition: "hostile", initiative: 3, hp: [40, 40] },
]);

const SECONDS_PER_ROUND = 6;

function sampleViewModel(entry, name) {
  const [value, max] = entry.hp ?? [0, 0];
  const hp = entry.virtual
    ? { mode: "none", pct: 0, critical: false }
    : { mode: "number", text: `${value}/${max}`, pct: value / max, critical: value / max <= 0.25, stateKey: healthState(value, max) };
  const dead = !entry.virtual && value <= 0;
  return {
    id: `sample-${entry.key}`,
    virtual: Boolean(entry.virtual),
    name,
    img: entry.img,
    tokenImg: entry.img,
    artImg: entry.img,
    imgPosition: "50% 20%",
    initials: initialsOf(name),
    initiative: entry.initiative,
    hasInitiative: true,
    dispositionKey: entry.disposition,
    concealed: false,
    defeated: dead,
    dead,
    alive: !dead,
    isOwner: Boolean(entry.owner),
    hasPlayerOwner: Boolean(entry.owner),
    players: [],
    hp,
    healthTone: entry.virtual ? null : healthTone(hp.pct),
    effects: [],
  };
}

/**
 * A WheelModel of the sample encounter on absolute turn `T` (any integer ≥ 0),
 * shaped like CombatProjector.project() so the real renderer and bar draw it.
 * @param {object} options
 * @param {number} options.T
 * @param {Record<string, string>} options.names  display name by sample key
 */
export function sampleWheelModel({ T = 0, names = {} } = {}) {
  const ring = SAMPLE_COMBATANTS.map((entry) => sampleViewModel(entry, names[entry.key] ?? entry.key));
  const N = ring.length;
  const turn = Math.max(0, Math.trunc(T));
  const currentIndex = mod(turn, N);
  const round = Math.floor(turn / N) + 1;
  const bySide = { friendly: 0, neutral: 0, hostile: 0, secret: 0 };
  const real = ring.filter((vm) => !vm.virtual);
  for (const vm of real) bySide[vm.dispositionKey] += 1;
  return {
    combatId: "sample",
    round,
    turn: currentIndex,
    started: true,
    ring,
    N,
    currentIndex,
    current: ring[currentIndex],
    activeHidden: false,
    T: turn,
    turnLabel: `${currentIndex + 1}/${N}`,
    nextUp: ring[(currentIndex + 1) % N],
    needsRoll: false,
    rolledCount: real.length,
    rollTotal: real.length,
    pendingIds: [],
    pendingOwnIds: [],
    canEndOwnTurn: ring[currentIndex].isOwner,
    stats: {
      total: real.length,
      bySide,
      standing: real.filter((vm) => vm.alive).length,
      hpBySide: null,
      elapsedSeconds: (round - 1) * SECONDS_PER_ROUND,
      expiring: [],
    },
  };
}

/** The sample members of a Venaerys phase and how far each got, for the preview's strip (RF-82). */
const SAMPLE_PHASE = Object.freeze([
  { key: "knight", status: "done" },
  { key: "archer", status: "acting" },
  { key: "cleric", status: "acting" },
  { key: "bandit", status: "defeated" },
]);

/**
 * A current Venaerys phase drawn from the sample encounter, shaped like the
 * `phase` PhaseProjector gives the bar, so the editor can show the strip
 * options without a phased combat.
 * @param {Record<string, string>} names  display name by sample key, plus `phase` for the phase's own
 */
export function samplePhase(names = {}) {
  const ring = SAMPLE_COMBATANTS.map((entry) => sampleViewModel(entry, names[entry.key] ?? entry.key));
  const acting = SAMPLE_PHASE.map(({ key, status }) => ({ ...ring.find((vm) => vm.id === `sample-${key}`), status }));
  return { name: names.phase ?? "phase", icon: "fa-solid fa-person-running", color: "#3f8fd2", acting };
}
