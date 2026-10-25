import { TIMING } from "../constants/module-constants.js";
import { stepPlan } from "../helpers/wheel-geometry.js";

/**
 * Decides how the displayed turn catches up with the real one (SPEC §9):
 * one 600 ms step, a run of short steps, or a direct swap with a fade.
 * A change of combat or of ring size always swaps, since the old T means
 * nothing on the new ring.
 */
export default class WheelAnimator {
  #renderer;
  #model = null;
  #displayedT = null;
  #timer = null;

  constructor(renderer) {
    this.#renderer = renderer;
  }

  /**
   * @param {object} model    the latest WheelModel
   * @param {object} motion   { speed, reducedMotion }
   * @param {number} targetT  turn to put on the anchor: the real one, or the one being viewed (RF-21)
   */
  show(model, motion, targetT = model.T) {
    const previous = this.#model;
    this.#model = model;
    const sameRing = previous && previous.combatId === model.combatId && previous.N === model.N;

    if (this.#displayedT === null) return this.#swap(targetT, { fade: false });
    if (!sameRing) return this.#swap(targetT, { fade: !motion.reducedMotion && motion.speed > 0 });

    const plan = stepPlan(this.#displayedT, targetT, motion);
    if (plan.mode === "none") {
      if (!this.#timer) this.#renderer.apply(model, this.#displayedT, { duration: 0 });
    } else if (plan.mode === "fade") this.#swap(targetT, { fade: true });
    else this.#run(plan.steps, plan.duration);
  }

  /** Lays the wheel out on `T` with no motion (the grid already flew the tiles there). */
  jump(model, T) {
    this.#model = model;
    this.#swap(T, { fade: false });
  }

  /** Forgets the displayed turn, so the next show() lays out without motion. */
  reset() {
    this.#cancel();
    this.#displayedT = null;
    this.#model = null;
  }

  #run(steps, duration) {
    this.#cancel();
    const queue = [...steps];
    const next = () => {
      this.#timer = null;
      this.#displayedT = queue.shift();
      this.#renderer.apply(this.#model, this.#displayedT, { duration });
      if (queue.length) this.#timer = setTimeout(next, duration);
    };
    next();
  }

  #swap(T, { fade }) {
    this.#cancel();
    if (!fade) {
      this.#displayedT = T;
      this.#renderer.apply(this.#model, T, { duration: 0 });
      return;
    }
    this.#renderer.setFaded(true);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#displayedT = T;
      this.#renderer.apply(this.#model, T, { duration: 0 });
      this.#renderer.setFaded(false);
    }, TIMING.fade);
  }

  #cancel() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#renderer.setFaded(false);
  }
}
