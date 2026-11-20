import type { Corner } from '../types';
import type { DriverInput } from '../../../shared/driverInput';
import type { TrackedVehicleSpec } from '../../../shared/trackedSpec';
import { DEFAULT_TURN_SPEED, HANDBRAKE_FACTOR, trackCommand, type TrackDriveParams } from '../../../shared/trackDrive';
import { DEFAULT_MAX_SLIP_SPEED, MOTOR_FACTOR } from '../parts/drive';

/** thrust of the whole vehicle at the track surface [N] at speed v: torque-limited at low, power-limited at high speed */
export function trackThrust(spec: TrackedVehicleSpec, radius: number, speed: number): number {
  return Math.min(spec.drive.maxTorque / radius, spec.drive.maxPower / Math.max(Math.abs(speed), 0.5));
}

/**
 * Track drive: every road wheel is driven. The command of each side (see `trackCommand`) sets the velocity motor of
 * that side's wheels, like the wheeled drive does per wheel. The torque cap is the vehicle's thrust split evenly over
 * all road wheels; the radius of a road wheel already includes the chain, so speeds are at the outer surface of the track.
 * @param forwardSpeed vehicle speed along its heading [m/s], + = forward
 */
export function applyTrackDrive(corners: Corner[], spec: TrackedVehicleSpec, input: DriverInput, forwardSpeed: number): void {
  const params: TrackDriveParams = {
    reverseSpeed: spec.drive.reverseSpeed,
    slipSpeed: spec.drive.maxSlipSpeed ?? DEFAULT_MAX_SLIP_SPEED,
    turnSpeed: spec.turnSpeed ?? DEFAULT_TURN_SPEED,
  };
  const left = trackCommand('L', input, forwardSpeed, params);
  const right = trackCommand('R', input, forwardSpeed, params);

  for (const c of corners) {
    const cmd = c.side === 'L' ? left : right;
    const r = c.axle.wheel.radius;
    let torque: number;
    switch (cmd.mode) {
      case 'drive':
        torque = ((trackThrust(spec, r, forwardSpeed) * r) / corners.length) * cmd.amount;
        break;
      case 'park':
        torque = c.axle.brake.torque * HANDBRAKE_FACTOR;
        break;
      default: // brake, hold
        torque = c.axle.brake.torque * cmd.amount;
    }
    c.joints.spin.configureMotorVelocity(cmd.speed / r, MOTOR_FACTOR);
    c.joints.spin.setMotorMaxForce(torque);
  }
}
