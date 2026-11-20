import type { DriverInput } from './driverInput';

/**
 * Skid steering of a tracked vehicle (pure, no Rapier): converts the driver input into a command for each track.
 * There is no steering angle: the vehicle turns because its two tracks run at different speeds.
 * The wheeled drive (`parts/drive.ts`) uses the same ideas: no gearbox, the motor target is above the vehicle speed
 * by a slip allowance, and the torque is capped; priority handbrake > brake > drive > idle.
 */

/** track speed difference at full steer [m/s]: each track runs this much faster (outer) or slower (inner) than the base speed */
export const DEFAULT_TURN_SPEED = 3;
/** below this speed [m/s], brake switches to reverse (as for wheeled vehicles) */
export const REVERSE_THRESHOLD = 0.6;
/** a track counts as slowing down when its target is this much below the vehicle speed [m/s] */
const SLOW_MARGIN = 0.1;
/** share of the brake torque that holds a vehicle at standstill without input (below `REVERSE_THRESHOLD`): it stays parked, also on a slope; while rolling it coasts */
export const IDLE_HOLD_SHARE = 1;
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
 *  - `brake`: run at `speed` (0 = stop) with `amount` of the brake torque; while driving, the inner track of a turn brakes to its slower speed
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
  // throttle and steering are mixed like a tank's two sticks: each track gets `throttle ∓ steer`; if that exceeds
  // full power, both are scaled down together so the turn keeps its ratio (full throttle + full steer = one track only)
  const t = wantsReverse ? -input.brake : input.throttle;
  const left = t - steer;
  const right = t + steer;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  const amount = Math.abs(side === 'L' ? left : right) / scale;
  if (t === 0 && steer === 0) {
    // no input: rolling coasts free (like the wheeled vehicles); only at (almost) standstill the tracks hold, so a parked vehicle stays on a slope
    if (Math.abs(forwardSpeed) > REVERSE_THRESHOLD) return { mode: 'brake', speed: forwardSpeed, amount: 0 };
    return { mode: 'hold', speed: 0, amount: IDLE_HOLD_SHARE };
  }

  // rolling without throttle, steering: skid steering needs a speed difference between the tracks. Targets of 0 would make
  // both tracks brake at their torque limit (no difference, no turn), so the tracks are held at the vehicle speed ± turn:
  // the inner track brakes down to its slower speed, the outer one coasts free (no drive: the vehicle only slows down)
  if (t === 0 && Math.abs(forwardSpeed) > REVERSE_THRESHOLD) {
    const target = forwardSpeed + (side === 'L' ? -steer : steer) * p.turnSpeed;
    const inner = Math.abs(target) < Math.abs(forwardSpeed) - SLOW_MARGIN;
    return { mode: 'brake', speed: target, amount: inner ? Math.abs(steer) : 0 };
  }

  // the slip allowance fades with steering: at full steer the tracks differ by ±turnSpeed around the vehicle speed
  // (otherwise the inner track would hold the vehicle speed and fight the turn)
  const slip = p.slipSpeed * (1 - Math.abs(steer));
  let base = 0;
  if (wantsReverse) base = -Math.min(p.reverseSpeed, Math.max(0, -forwardSpeed) + slip);
  else if (input.throttle > 0) base = Math.max(0, forwardSpeed) + slip;

  // left turn (steer > 0): left track slower, right track faster
  const turn = (side === 'L' ? -steer : steer) * p.turnSpeed;
  const speed = base + turn;
  // driving on, the inner track of a turn has to slow down: it brakes (the engine thrust all goes to the outer track)
  if (input.throttle > 0 && forwardSpeed > REVERSE_THRESHOLD && speed < forwardSpeed - SLOW_MARGIN && steer !== 0)
    return { mode: 'brake', speed, amount: Math.abs(steer) };
  return { mode: 'drive', speed, amount };
}
