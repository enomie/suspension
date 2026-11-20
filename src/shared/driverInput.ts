/**
 * Driver input: the vehicle-neutral drive command.
 *
 * A steering layer (keyboard, gamepad, AI, network) produces this; each vehicle type converts it on its own
 * (wheeled: steering angle and wheel motors, tracked: left/right track speed, boat: thrust and rudder).
 * The producer never needs to know the vehicle type.
 */
export interface DriverInput {
  /** 0…1 */
  throttle: number;
  /** 0…1 */
  brake: number;
  /** −1 (right) … +1 (left) */
  steer: number;
  handbrake: boolean;
  /** Boost (Shift): doubles drive torque and top speed */
  boost?: boolean;
  /**
   * Differential lock level 0…1 (see `DIFF_LOCK_LEVELS`): 0 = open, 1 = rigid like a spooled axle, between = clutch.
   * Wheeled vehicles only; other vehicle types ignore it.
   */
  diffLock?: number;
}

/** Input with everything released: no throttle, no brake, wheels straight, handbrake off. */
export function neutralInput(): DriverInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false };
}
