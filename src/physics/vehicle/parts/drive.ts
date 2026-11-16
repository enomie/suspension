import type { Corner, DriveSpec, DriverInput } from '../types';
import { ROLLING_FORCE_PER_WHEEL } from '../../../shared/performance';

/** velocity motor damping factor [N·m·s/rad] — high = stiff, torque capped via MaxForce. */
const MOTOR_FACTOR = 1e4;
/**
 * default slip limit (ASR, `DriveSpec.maxSlipSpeed` overrides): wheel tangential speed at most this much above vehicle speed [m/s].
 * Without it an unloaded wheel spins to vMax (each wheel has its own motor = open diff with no load).
 */
const DEFAULT_MAX_SLIP_SPEED = 2.5;
/** below this speed [m/s], S switches from brake to reverse */
const REVERSE_THRESHOLD = 0.6;
const drivenOnAxle: number[] = [];

/**
 * drive + service brake + handbrake per wheel via spin joint velocity motor.
 * No gearbox: throttle = motor target above the vehicle speed, thrust capped by torque (low speed) and power (P / v).
 * Top speed results from rolling + air drag (see performance.ts; the drag itself is applied to the chassis in Vehicle).
 * Rolling resistance: the same force at every wheel (ROLLING_FORCE_PER_WHEEL), as torque while coasting, subtracted from the thrust while driving.
 * priority: handbrake (axles with `handbrake` only) > brake > drive > rolling resistance.
 */
export function applyDrive(corners: Corner[], spec: DriveSpec, input: DriverInput, forwardSpeed: number): void {
  const slip = spec.maxSlipSpeed ?? DEFAULT_MAX_SLIP_SPEED;
  const limit = (input.boost ? spec.maxBoostSpeed : spec.maxSpeed) ?? Infinity;
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
    const rollTorque = ROLLING_FORCE_PER_WHEEL * r;
    let target = 0;
    let torque = rollTorque;

    if (input.handbrake && c.axle.handbrake) {
      torque = c.axle.handbrake.torque;
    } else if (braking) {
      torque = c.axle.brake.torque * brakeAmount;
    } else if (c.axle.drive && (input.throttle > 0 || wantsReverse)) {
      const wheels = drivenOnAxle[c.axleIndex] || 1;
      const perWheel = (spec.maxTorque * c.axle.drive.share) / wheels;
      // power limit: torque ≤ P / ω with ω from the vehicle speed (a spinning wheel keeps its torque)
      const omega = Math.max(Math.abs(forwardSpeed), 0.5) / r;
      const cap = Math.min(perWheel, (spec.maxPower * c.axle.drive.share) / wheels / omega);
      if (wantsReverse) {
        target = -Math.min(spec.reverseSpeed, Math.max(0, -forwardSpeed) + slip) / r;
        torque = Math.max(0, cap * input.brake - rollTorque);
      } else {
        target = Math.min(limit, Math.max(0, forwardSpeed) + slip) / r;
        torque = Math.max(0, cap * input.throttle - rollTorque);
      }
    }
    j.configureMotorVelocity(target, MOTOR_FACTOR);
    j.setMotorMaxForce(torque);
  }
}
