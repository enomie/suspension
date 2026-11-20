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
 * that side's wheels, like the wheeled drive does per wheel. The torque cap is the vehicle's thrust, shared between the
 * two tracks by their demand (steering can send all of it to one track) and evenly over the wheels of a track; the radius of a road wheel already includes the chain, so speeds are at the outer surface of the track.
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

  // the engine feeds the driven tracks: one track alone gets all of the thrust, two tracks at full demand half each
  const demand = (left.mode === 'drive' ? left.amount : 0) + (right.mode === 'drive' ? right.amount : 0);
  const wheelsPerSide = Math.max(1, corners.length / 2);

  for (const c of corners) {
    const cmd = c.side === 'L' ? left : right;
    const r = c.axle.wheel.radius;
    let torque: number;
    switch (cmd.mode) {
      case 'drive':
        torque = ((trackThrust(spec, r, forwardSpeed) * r * cmd.amount) / Math.max(1, demand)) / wheelsPerSide;
        break;
      case 'park':
        torque = c.axle.brake.torque * HANDBRAKE_FACTOR;
        break;
      default: // brake, hold
        torque = c.axle.brake.torque * cmd.amount;
    }
    c.joints.spin.configureMotorVelocity(cmd.speed / r, MOTOR_FACTOR); // brake/hold/park: speed 0 unless the inner track of a turn brakes to a slower speed
    c.joints.spin.setMotorMaxForce(torque);
  }
}
