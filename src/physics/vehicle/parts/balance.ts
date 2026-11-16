import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { BalanceSpec } from '../types';
import { G } from '../tuning';

const _q = new Quaternion();
const _f = new Vector3();
const _u = new Vector3();
const _r = new Vector3();
const _w = new Vector3();
const _h = new Vector3();
const UP = new Vector3(0, 1, 0);

/** feedback gains of the steering controller (per rad of lean error / per rad/s of roll rate) */
const LEAN_GAIN = 2.5;
const RATE_GAIN = 0.35;
/** below this speed the steering feedback is useless (steer authority ∝ v²) [m/s] */
const MIN_FEEDBACK_SPEED = 2;
/** share of the stand stiffness that stays active at speed (0…1) */
const RIDER_SHARE = 0.3;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Balance assist for single-track vehicles (no rider model).
 *  - moving: steer into the lean (feedback on lean error + roll rate). The input commands a lean angle for the
 *    steady turn `tan φ = v²·tan δ / (g·L)`; the steering itself is feed-forward from the input.
 *  - slow / stopped: a virtual stand (roll torque, PD) fades in so the bike does not fall over at rest.
 */
export class Balance {
  /** lean angle [rad], + = leaning right */
  lean = 0;
  /** roll rate [rad/s], + = leaning further right */
  rollRate = 0;

  constructor(
    private spec: BalanceSpec,
    private wheelbase: number,
  ) {}

  /**
   * @param input smoothed steering input −1…1, + = left (commands a lateral acceleration, not a steer angle)
   * @param maxSteer steering lock [rad]
   * @returns total steering angle [rad], + = left
   */
  update(chassis: RAPIER.RigidBody, input: number, maxSteer: number, forwardSpeed: number): number {
    const r = chassis.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _f.set(0, 0, -1).applyQuaternion(_q);
    _u.set(0, 1, 0).applyQuaternion(_q);
    // horizontal right-hand direction of travel
    _r.crossVectors(_h.set(_f.x, 0, _f.z).normalize(), UP);
    this.lean = Math.atan2(_u.dot(_r), _u.y);
    const av = chassis.angvel();
    this.rollRate = _w.set(av.x, av.y, av.z).dot(_f);

    const v = Math.abs(forwardSpeed);
    // input asks for a fraction of the lateral acceleration that the max lean allows
    const aMax = G * Math.tan(this.spec.maxLean * 0.85);
    // steer angle for that curvature (ackermann: tan δ = L·a / v²), never more than the lock
    const lock = Math.min(maxSteer, Math.atan((this.wheelbase * aMax) / Math.max(v * v, 1e-3)));
    const feedForward = Math.max(-1, Math.min(1, input)) * lock;
    // lean angle of that steady turn (left turn = leaning left = negative)
    const target = -Math.atan((v * v * Math.tan(feedForward)) / (G * this.wheelbase));

    // virtual stand at low speed; at speed a light "rider" share stays on so bumps do not throw the bike over.
    // It pulls toward the lean of the commanded turn, so it never fights a normal corner.
    const stand = 1 - smooth((v - this.spec.standSpeed * 0.5) / (this.spec.standSpeed * 0.5));
    const w = Math.max(stand, RIDER_SHARE);
    chassis.resetTorques(false);
    const t = w * (-this.spec.standStiffness * (this.lean - (1 - stand) * target) - this.spec.standDamping * this.rollRate);
    chassis.addTorque({ x: _f.x * t, y: _f.y * t, z: _f.z * t }, true);

    // steering feedback: steer toward the side the bike is falling to (right lean → steer right = negative)
    const authority = smooth((v - MIN_FEEDBACK_SPEED) / MIN_FEEDBACK_SPEED);
    const scale = Math.min(1, 25 / (Math.max(v, MIN_FEEDBACK_SPEED) ** 2)) * authority;
    const feedback = -scale * (LEAN_GAIN * (this.lean - target) + RATE_GAIN * this.rollRate);
    return Math.max(-maxSteer, Math.min(maxSteer, feedForward + feedback));
  }
}
