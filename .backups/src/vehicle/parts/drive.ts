import type { Corner, DriveSpec, DriverInput } from '../types';

/** Dämpfungsfaktor des Velocity-Motors [N·m·s/rad] – hoch = steif, Moment wird über MaxForce begrenzt. */
const MOTOR_FACTOR = 1e4;
/** unter dieser Geschwindigkeit [m/s] wechselt S von Bremse auf Rückwärts */
const REVERSE_THRESHOLD = 0.6;

/**
 * Antrieb + Betriebsbremse + Handbremse pro Rad über den Velocity-Motor des Spin-Joints.
 * Kein Getriebe (Phase 1): Gas = Ziel-Raddrehzahl vMax/r, Moment begrenzt.
 * Priorität: Handbremse (nur Achsen mit `handbrake`) > Bremse > Antrieb > Rollwiderstand.
 */
export function applyDrive(corners: Corner[], spec: DriveSpec, input: DriverInput, forwardSpeed: number): void {
  const driven = corners.filter((c) => c.axle.drive);
  const shareSum = new Map<number, number>();
  for (const c of driven) shareSum.set(c.axleIndex, (shareSum.get(c.axleIndex) ?? 0) + 1);

  const wantsReverse = input.brake > 0 && forwardSpeed < REVERSE_THRESHOLD && input.throttle === 0;
  const braking =
    (input.brake > 0 && forwardSpeed >= REVERSE_THRESHOLD) ||
    (input.throttle > 0 && forwardSpeed < -REVERSE_THRESHOLD);
  const brakeAmount = input.brake > 0 ? input.brake : input.throttle;

  for (const c of corners) {
    const j = c.joints.spin;
    const r = c.axle.wheel.radius;
    let target = 0;
    let torque = spec.rollingResistance;

    if (input.handbrake && c.axle.handbrake) {
      torque = c.axle.handbrake.torque;
    } else if (braking) {
      torque = c.axle.brake.torque * brakeAmount;
    } else if (c.axle.drive && (input.throttle > 0 || wantsReverse)) {
      const perWheel = (spec.maxTorque * c.axle.drive.share) / (shareSum.get(c.axleIndex) ?? 1);
      if (wantsReverse) {
        target = -spec.reverseSpeed / r;
        torque = perWheel * input.brake;
      } else {
        target = spec.maxSpeed / r;
        torque = perWheel * input.throttle;
      }
    }
    j.configureMotorVelocity(target, MOTOR_FACTOR);
    j.setMotorMaxForce(torque);
  }
}
