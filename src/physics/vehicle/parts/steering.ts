import type { Corner, SteeringSpec, VehicleSpec } from '../types';
import { STEER_DAMPING, STEER_STIFFNESS } from './suspension/common';

/**
 * Lenkung: glättet den Fahrerinput und berechnet pro Rad den Lenkwinkel.
 * ackermann: Wendekreismittelpunkt liegt auf Höhe der ungelenkten Achsen (bzw. Mitte, wenn alle lenken)
 *            → innere Räder stärker, Achsen hinter dem Bezugspunkt lenken automatisch gegenläufig.
 * crab: alle Räder gleicher Winkel (Hundegang).
 */
export class Steering {
  /** geglätteter Input −1…1 */
  value = 0;
  private refZ: number;
  private refL: number;
  private refMax: number;

  constructor(private spec: SteeringSpec, vehicle: VehicleSpec) {
    const steered = vehicle.axles.filter((a) => a.steer);
    const fixed = vehicle.axles.filter((a) => !a.steer);
    // Turning centre lies on the line through the fixed axles; if every axle steers, in the middle of the steered ones
    const ref = fixed.length ? fixed : steered;
    this.refZ = ref.length ? ref.reduce((s, a) => s + a.z, 0) / ref.length : 0;
    const first = steered[0];
    this.refL = first ? Math.abs(this.refZ - first.z) || 1 : 1;
    this.refMax = first?.steer?.maxAngle ?? 0;
  }

  private speedScale = 1;

  update(input: number, dt: number, speed: number, maxSpeed: number): void {
    const target = Math.max(-1, Math.min(1, input));
    const returning = target === 0 || (this.value !== 0 && Math.sign(target) !== Math.sign(this.value));
    const rate = (returning ? this.spec.returnRate : this.spec.rate) / Math.max(this.refMax, 1e-3);
    const d = target - this.value;
    this.value += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    const hs = this.spec.highSpeedFactor ?? 1;
    this.speedScale = 1 + (hs - 1) * Math.min(1, Math.abs(speed) / maxSpeed);
  }

  /** Referenz-Lenkwinkel der ersten Lenkachse [rad], + = links */
  get angle(): number {
    return this.value * this.refMax * this.speedScale;
  }

  angleFor(c: Corner): number {
    const max = c.axle.steer?.maxAngle ?? 0;
    if (!max) return 0;
    const delta = this.angle;
    let a: number;
    // `counter` axles steer against the front axle; the magnitude comes from the distance to the turning-centre line
    const sign = c.axle.steer?.counter ? -1 : 1;
    if (this.spec.mode === 'crab' || Math.abs(delta) < 1e-4) {
      a = this.spec.mode === 'crab' ? sign * delta : 0;
    } else {
      const radius = this.refL / Math.tan(delta); // + = centre on the left
      const L = Math.abs(this.refZ - c.axle.z);
      const sx = c.anchor[0];
      a = sign * Math.atan(L / (radius + sx));
    }
    return Math.max(-max, Math.min(max, a));
  }

  apply(corners: Corner[]): void {
    for (const c of corners) {
      if (!c.joints.steer) continue;
      const a = this.angleFor(c);
      c.telemetry.steerAngle = a;
      c.joints.steer.configureMotorPosition(a, STEER_STIFFNESS, STEER_DAMPING);
    }
  }
}
