import type { Corner, DriveSpec, DriverInput } from '../types';

/** velocity motor damping factor [N·m·s/rad] — high = stiff, torque capped via MaxForce. */
const MOTOR_FACTOR = 1e4;
/**
 * slip limit (ASR): wheel tangential speed at most this much above vehicle speed [m/s].
 * Without it an unloaded wheel spins to vMax (each wheel has its own motor = open diff with no load).
 */
const MAX_SLIP_SPEED = 2.5;
/** below this speed [m/s], S switches from brake to reverse */
const REVERSE_THRESHOLD = 0.6;
/** Boost (Shift): factor on drive torque and top speed */
const BOOST_FACTOR = 2;

const drivenOnAxle: number[] = [];

/**
 * drive + service brake + handbrake per wheel via spin joint velocity motor.
 * No gearbox (phase 1): throttle = target wheel speed vMax/r, torque limited.
 * priority: handbrake (axles with `handbrake` only) > brake > drive > rolling resistance.
 */
export function applyDrive(corners: Corner[], spec: DriveSpec, input: DriverInput, forwardSpeed: number): void {
  const boost = input.boost ? BOOST_FACTOR : 1;
  // driven wheels per axle (scratch array: no allocation per physics step)
  for (const c of corners) drivenOnAxle[c.axleIndex] = 0;
  for (const c of corners) if (c.axle.drive) drivenOnAxle[c.axleIndex]++;

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
      const perWheel = (spec.maxTorque * boost * c.axle.drive.share) / (drivenOnAxle[c.axleIndex] || 1);
      if (wantsReverse) {
        target = -Math.min(spec.reverseSpeed, Math.max(0, -forwardSpeed) + MAX_SLIP_SPEED) / r;
        torque = perWheel * input.brake;
      } else {
        target = Math.min(spec.maxSpeed * boost, Math.max(0, forwardSpeed) + MAX_SLIP_SPEED) / r;
        torque = perWheel * input.throttle;
      }
    }
    j.configureMotorVelocity(target, MOTOR_FACTOR);
    j.setMotorMaxForce(torque);
  }
}
