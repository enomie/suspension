import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { Corner } from '../types';

/** A left/right wheel pair of one driven axle and the shaft joint that couples them while it exists */
interface Pair {
  a: Corner;
  b: Corner;
  /** no differential: the shaft is always there */
  spooled: boolean;
  joint: RAPIER.ImpulseJoint | null;
}

/**
 * Differentials. A driven axle with an open differential lets its two wheels turn independently (each wheel has its own motor).
 * An axle without one (`differential === false`), or any differential while the driver's lock is engaged, couples the wheels
 * like one shaft: a joint that locks their relative rotation about the spin axis, solved together with the contacts.
 * Only left/right pairs are coupled (center and double-center wheels have no partner).
 */
export class Differentials {
  private pairs: Pair[] = [];

  constructor(
    private R: typeof RAPIER,
    private world: RAPIER.World,
    corners: Corner[],
  ) {
    const axles = new Set(corners.filter((c) => c.axle.drive).map((c) => c.axleIndex));
    for (const axleIndex of axles) {
      const of = (side: Corner['side']) => corners.filter((c) => c.axleIndex === axleIndex && c.side === side);
      const left = of('L');
      const right = of('R');
      for (let i = 0; i < Math.min(left.length, right.length); i++) {
        this.pairs.push({ a: left[i], b: right[i], spooled: left[i].axle.differential === false, joint: null });
      }
    }
    this.update(false);
  }

  /** engage or release the shafts for the current lock state (call before every step; does nothing when unchanged) */
  update(locked: boolean): void {
    for (const p of this.pairs) {
      const want = p.spooled || locked;
      if (want && !p.joint) p.joint = this.couple(p.a, p.b);
      else if (!want && p.joint) {
        this.world.removeImpulseJoint(p.joint, true);
        p.joint = null;
      }
    }
  }

  /** number of wheel pairs currently coupled */
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
