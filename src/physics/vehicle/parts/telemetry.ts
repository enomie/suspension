import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner } from '../types';

const _q = new Quaternion();
const _qi = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();

/**
 * Refreshes the telemetry of every corner after `world.step()`: suspension travel (+ = extended), spring force and
 * wheel spin rate relative to its carrier. Shared by the wheeled and the tracked vehicle.
 */
export function updateCornerTelemetry(chassis: RAPIER.RigidBody, corners: Corner[]): void {
  const ct = chassis.translation();
  const cr = chassis.rotation();
  _qi.set(cr.x, cr.y, cr.z, cr.w).invert();
  for (const c of corners) {
    // suspension travel generically via wheel center in chassis space (+ = extended)
    const wt = c.wheel.translation();
    _v.set(wt.x - ct.x, wt.y - ct.y, wt.z - ct.z).applyQuaternion(_qi);
    const travel = -(_v.y - c.anchor[1]);
    c.telemetry.travel = travel;
    c.telemetry.springForce = c.stiffness * (c.preload - travel);

    const parent = c.knuckle ?? c.carrier;
    const pr = parent.rotation();
    _q.set(pr.x, pr.y, pr.z, pr.w);
    _w.set(-1, 0, 0).applyQuaternion(_q);
    const wa = c.wheel.angvel();
    const pa = parent.angvel();
    c.telemetry.wheelOmega = _w.x * (wa.x - pa.x) + _w.y * (wa.y - pa.y) + _w.z * (wa.z - pa.z);
  }
}
