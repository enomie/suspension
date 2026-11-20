import type { DriverInput } from './driverInput';

/**
 * Skid steering of a tracked vehicle (pure, no Rapier): converts the driver input into a command for each track.
 * There is no steering angle: the vehicle turns because its two tracks run at different speeds.
 * The wheeled drive (`parts/drive.ts`) uses the same ideas: no gearbox, the motor target is above the vehicle speed
 * by a slip allowance, and the torque is capped; priority handbrake > brake > drive > idle.
 */

/** track speed difference at full steer [m/s]: each track runs this much faster (outer) or slower (inner) than the base speed */
export const DEFAULT_TURN_SPEED = 2.5;
/** below this speed [m/s], brake switches to reverse (as for wheeled vehicles) */
export const REVERSE_THRESHOLD = 0.6;
/** share of the brake torque that holds an idle vehicle (no input): it stops and stays parked instead of rolling on */
export const IDLE_HOLD_SHARE = 0.3;
/** handbrake: brake torque is multiplied by this, so it holds the vehicle on a slope */
export const HANDBRAKE_FACTOR = 10;

export type TrackSide = 'L' | 'R';

export interface TrackDriveParams {
  /** top reverse speed [m/s] */
  reverseSpeed: number;
  /** how much faster than the vehicle the track may run [m/s], limits wheelspin */
  slipSpeed: number;
  /** speed difference per track at full steer [m/s] */
  turnSpeed: number;
}

/**
 * What one track does:
 *  - `drive`: run at `speed` [m/s, + = forward] with up to `amount` (0…1) of the drive torque cap
 *  - `brake`: hold at 0 with `amount` of the brake torque
 *  - `hold`: hold at 0 with the idle share of the brake torque
 *  - `park`: hold at 0 with the handbrake torque
 */
export interface TrackCommand {
  mode: 'drive' | 'brake' | 'hold' | 'park';
  speed: number;
  amount: number;
}

/**
 * Command for one track from the driver input. Steer −1 = right, +1 = left: turning left slows the left track
 * and speeds up the right one. With no throttle the tracks run in opposite directions (turn on the spot).
 * @param forwardSpeed vehicle speed along its heading [m/s], + = forward
 */
export function trackCommand(side: TrackSide, input: DriverInput, forwardSpeed: number, p: TrackDriveParams): TrackCommand {
  if (input.handbrake) return { mode: 'park', speed: 0, amount: 1 };

  const wantsReverse = input.brake > 0 && forwardSpeed < REVERSE_THRESHOLD && input.throttle === 0;
  const braking = (input.brake > 0 && forwardSpeed >= REVERSE_THRESHOLD) || (input.throttle > 0 && forwardSpeed < -REVERSE_THRESHOLD);
  if (braking) return { mode: 'brake', speed: 0, amount: input.brake > 0 ? input.brake : input.throttle };

  const steer = Math.max(-1, Math.min(1, input.steer));
  let base = 0;
  let amount = Math.abs(steer);
  // the slip allowance fades with steering: at full steer the tracks differ by ±turnSpeed around the vehicle speed
  // (otherwise the inner track would hold the vehicle speed and fight the turn)
  const slip = p.slipSpeed * (1 - Math.abs(steer));
  if (wantsReverse) {
    base = -Math.min(p.reverseSpeed, Math.max(0, -forwardSpeed) + slip);
    amount = Math.max(amount, input.brake);
  } else if (input.throttle > 0) {
    base = Math.max(0, forwardSpeed) + slip;
    amount = Math.max(amount, input.throttle);
  }
  if (amount === 0) return { mode: 'hold', speed: 0, amount: IDLE_HOLD_SHARE };

  // left turn (steer > 0): left track slower, right track faster
  const turn = (side === 'L' ? -steer : steer) * p.turnSpeed;
  return { mode: 'drive', speed: base + turn, amount };
}
