/** physics tick [s] */
export const PHYSICS_DT = 1 / 120;
/**
 * Rapier limits a body's rotation to π/4 per solver step, so a wheel cannot spin faster than π/(4·dt) rad/s
 * (94 rad/s at 120 Hz ≈ 31 m/s for r = 0.33 m — no vehicle got faster, whatever `maxSpeed` said).
 * Each 120 Hz tick therefore runs this many solver steps of dt/PHYSICS_SUBSTEPS: 4 → 377 rad/s ≈ 124 m/s.
 */
export const PHYSICS_SUBSTEPS = 4;

/**
 * wall-clock tick: step n belongs at start + n·dt. `due(now)` = how many steps due now.
 * after hitches (> maxSteps) clock is pulled forward instead of catching up.
 */
export class StepClock {
  private start: number;
  n = 0;
  constructor(
    now: number,
    readonly dtMs = PHYSICS_DT * 1000,
    readonly maxSteps = 6,
  ) {
    this.start = now;
  }
  due(now: number): number {
    let k = Math.floor((now - this.start) / this.dtMs) - this.n;
    if (k > this.maxSteps) {
      this.start += (k - this.maxSteps) * this.dtMs;
      k = this.maxSteps;
    }
    return Math.max(0, k);
  }
  /** timestamp after the next step */
  stampNext(): number {
    this.n++;
    return this.start + this.n * this.dtMs;
  }
  /** time of next due step */
  nextAt(): number {
    return this.start + (this.n + 1) * this.dtMs;
  }
}
