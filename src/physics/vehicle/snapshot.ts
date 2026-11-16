import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { BODY_STRIDE, CORNER_STRIDE, HEADER, snapshotLength } from '../../shared/snapshot';
import type { Vehicle } from './Vehicle';

/**
 * vehicle state as snapshot (format: shared/snapshot.ts) — for worker AND projects without worker:
 * physics and rendering on same thread → each frame `visual.apply(writeVehicleSnapshot(...))`.
 * `bodies` = poseBodies(vehicle.built) (Reihenfolge = Layout-Indizes), `origin` = Floating Origin (sonst {0,0}).
 */
export function writeVehicleSnapshot(
  vehicle: Vehicle,
  bodies: RAPIER.RigidBody[],
  opts: { gen?: number; stamp?: number; origin?: { x: number; z: number }; out?: Float64Array } = {},
): Float64Array {
  const len = snapshotLength(vehicle.corners.length, bodies.length);
  const s = opts.out && opts.out.length === len ? opts.out : new Float64Array(len);
  const ox = opts.origin?.x ?? 0;
  const oz = opts.origin?.z ?? 0;
  s[0] = opts.gen ?? 0;
  s[1] = opts.stamp ?? 0;
  s[2] = vehicle.forwardSpeed;
  let o = HEADER;
  for (const c of vehicle.corners) {
    const m = c.telemetry;
    s[o] = m.travel;
    s[o + 1] = m.springForce;
    s[o + 2] = m.wheelOmega;
    s[o + 3] = m.steerAngle;
    o += CORNER_STRIDE;
  }
  for (const b of bodies) {
    const p = b.translation();
    const r = b.rotation();
    s[o] = p.x + ox;
    s[o + 1] = p.y;
    s[o + 2] = p.z + oz;
    s[o + 3] = r.x;
    s[o + 4] = r.y;
    s[o + 5] = r.z;
    s[o + 6] = r.w;
    o += BODY_STRIDE;
  }
  return s;
}
