import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { Corner } from '../types';

/** Clutch capacity at lock level 1 as a share of the drive torque of one driven wheel: the clutch scales with the vehicle's power */
const CLUTCH_TORQUE_SHARE = 0.15;
/** clutch motor strength [N·m·s/rad]: stiff, so the torque cap is what limits it (as for the wheel motors) */
const CLUTCH_FACTOR = 1e4;

/** A left/right wheel pair of one driven axle */
interface Pair {
  a: Corner;
  b: Corner;
  /** no differential: the shaft is always there */
  spooled: boolean;
  /** rigid shaft joint while it exists */
  joint: RAPIER.ImpulseJoint | null;
  /** clutch joint while it exists: no locked axis, a motor on the spin axis holds the relative speed at zero */
  clutch: RAPIER.ImpulseJoint | null;
}

/**
 * Differentials. A driven axle with an open differential lets its two wheels turn independently (each wheel has its own motor).
 * The driver's lock level (0…1) couples them:
 *  - 0: open;
 *  - between: a clutch pushes the two wheels toward the same speed with a torque of `level × clutchTorque`, so the
 *    differential limits slip but still lets the wheels part under load (limited slip);
 *  - 1, or an axle without differential (`differential === false`): a rigid shaft, a joint that locks the relative rotation
 *    about the spin axis and is solved together with the contacts.
 * Only left/right pairs are coupled (center and double-center wheels have no partner).
 */
export class Differentials {
  private pairs: Pair[] = [];
  /** clutch torque at lock level 1 [N·m] */
  private readonly clutchTorque: number;

  constructor(
    private R: typeof RAPIER,
    private world: RAPIER.World,
    corners: Corner[],
    /** total drive torque of the vehicle [N·m] (`DriveSpec.maxTorque`) */
    driveTorque: number,
  ) {
    this.clutchTorque = (CLUTCH_TORQUE_SHARE * driveTorque) / Math.max(1, corners.filter((c) => c.axle.drive).length);
    const axles = new Set(corners.filter((c) => c.axle.drive).map((c) => c.axleIndex));
    for (const axleIndex of axles) {
      const of = (side: Corner['side']) => corners.filter((c) => c.axleIndex === axleIndex && c.side === side);
      const left = of('L');
      const right = of('R');
      for (let i = 0; i < Math.min(left.length, right.length); i++) {
        this.pairs.push({ a: left[i], b: right[i], spooled: left[i].axle.differential === false, joint: null, clutch: null });
      }
    }
    this.update(0);
  }

  /** apply the lock level 0…1 for the next step (joints are only created or removed when the step changes) */
  update(level: number): void {
    for (const p of this.pairs) {
      const rigid = p.spooled || level >= 1;
      const partial = !rigid && level > 0;
      if (rigid && !p.joint) p.joint = this.couple(p.a, p.b);
      else if (!rigid && p.joint) p.joint = this.release(p.joint);
      if (partial && !p.clutch) p.clutch = this.createClutch(p.a, p.b);
      else if (!partial && p.clutch) p.clutch = this.release(p.clutch);
      if (p.clutch) this.setClutchTorque(p.clutch, level * this.clutchTorque);
    }
  }

  private release(joint: RAPIER.ImpulseJoint): null {
    this.world.removeImpulseJoint(joint, true);
    return null;
  }

  /**
   * Slipping clutch between the two wheels: a joint that locks nothing, with a velocity motor on the spin axis that holds the
   * relative speed at zero, up to a torque cap. Below the cap the wheels turn together, above it the clutch slips.
   */
  private createClutch(a: Corner, b: Corner): RAPIER.ImpulseJoint {
    const R = this.R;
    const zero = { x: 0, y: 0, z: 0 };
    const joint = this.world.createImpulseJoint(R.JointData.generic(zero, zero, { x: 1, y: 0, z: 0 }, 0 as RAPIER.JointAxesMask), a.wheel, b.wheel, true);
    motor(this.R).configureMotorModel.call(joint, R.JointAxis.AngX, R.MotorModel.ForceBased);
    motor(this.R).configureMotorVelocity.call(joint, R.JointAxis.AngX, 0, CLUTCH_FACTOR);
    return joint;
  }

  private setClutchTorque(joint: RAPIER.ImpulseJoint, torque: number): void {
    motor(this.R).setMotorMaxForce.call(joint, this.R.JointAxis.AngX, torque);
  }

  /** number of wheel pairs currently coupled by a rigid shaft */
  get coupled(): number {
    return this.pairs.filter((p) => p.joint).length;
  }

  /** lock the relative rotation about the wheels' spin axis (local X); the current phase difference is the zero point, so engaging does not jolt */
  private couple(a: Corner, b: Corner): RAPIER.ImpulseJoint {
    const R = this.R;
    const x = { x: 1, y: 0, z: 0 };
    const zero = { x: 0, y: 0, z: 0 };
    const data = R.JointData.generic(zero, zero, x, R.JointAxesMask.AngX);
    const qa = a.wheel.rotation();
    const qb = b.wheel.rotation();
    // frame_b = qb⁻¹ · qa, so both frames coincide in the current pose
    const inv = { x: -qb.x, y: -qb.y, z: -qb.z, w: qb.w };
    data.frame1 = { x: 0, y: 0, z: 0, w: 1 };
    data.frame2 = {
      x: inv.w * qa.x + inv.x * qa.w + inv.y * qa.z - inv.z * qa.y,
      y: inv.w * qa.y - inv.x * qa.z + inv.y * qa.w + inv.z * qa.x,
      z: inv.w * qa.z + inv.x * qa.y - inv.y * qa.x + inv.z * qa.w,
      w: inv.w * qa.w - inv.x * qa.x - inv.y * qa.y - inv.z * qa.z,
    };
    return this.world.createImpulseJoint(data, a.wheel, b.wheel, true);
  }
}

/**
 * The axis motor methods of Rapier's JS wrapper exist only on `SphericalImpulseJoint`, but the underlying calls take the axis and
 * work for any joint; a generic joint object has no such methods. So we borrow them from the spherical wrapper's prototype.
 */
function motor(R: typeof RAPIER): Pick<RAPIER.SphericalImpulseJoint, 'configureMotorModel' | 'configureMotorVelocity' | 'setMotorMaxForce'> {
  return R.SphericalImpulseJoint.prototype;
}
