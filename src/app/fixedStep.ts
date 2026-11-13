/**
 * Fester Physik-Takt mit Akkumulator. Gibt alpha (0…1) für die Render-Interpolation zurück:
 * Anteil der Zeit, die seit dem letzten Schritt schon vergangen ist.
 */
export class FixedStep {
  private acc = 0;

  constructor(
    readonly dt = 1 / 120,
    /** Obergrenze pro Frame (gegen „Todesspirale“ nach Hängern) */
    readonly maxSteps = 4,
  ) {}

  advance(frameDt: number, step: () => void): number {
    this.acc = Math.min(this.acc + frameDt, this.dt * this.maxSteps);
    while (this.acc >= this.dt) {
      step();
      this.acc -= this.dt;
    }
    return this.acc / this.dt;
  }
}
