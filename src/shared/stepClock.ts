/** Physik-Takt [s] */
export const PHYSICS_DT = 1 / 120;

/**
 * Takt mit Wanduhr: Schritt n gehört zum Zeitpunkt start + n·dt. `due(now)` = wie viele Schritte jetzt fällig.
 * Nach Hängern (> maxSteps) wird die Uhr nachgezogen statt aufzuholen.
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
  /** Zeitstempel nach dem nächsten Schritt */
  stampNext(): number {
    this.n++;
    return this.start + this.n * this.dtMs;
  }
  /** Zeitpunkt des nächsten fälligen Schritts */
  nextAt(): number {
    return this.start + (this.n + 1) * this.dtMs;
  }
}
