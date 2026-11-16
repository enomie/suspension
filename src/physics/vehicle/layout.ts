import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { BodyPoint, VehicleLayout } from '../../shared/vehicleLayout';
import type { Attach, Vec3, VehicleSpec } from './types';
import type { BuiltVehicle } from './buildVehicle';

/**
 * all bodies with visible pose, fixed order = index in snapshot.
 */
export function poseBodies(built: BuiltVehicle): RAPIER.RigidBody[] {
  return [...new Set([built.chassis, ...built.corners.flatMap((c) => [c.carrier, ...c.bodies])])];
}

/** physics vehicle → plain data layout for rendering */
export function describeLayout(spec: VehicleSpec, built: BuiltVehicle): VehicleLayout {
  const bodies = poseBodies(built);
  const index = new Map(bodies.map((b, i) => [b.handle, i]));
  const idx = (b: RAPIER.RigidBody) => index.get(b.handle)!;
  const point = (a: Attach): BodyPoint => ({ body: idx(a.body), local: a.local });
  const mounts: Vec3[] = [];
  for (const c of built.corners)
    for (const v of c.visuals)
      for (const a of [v.a, v.b]) if (a.body.handle === built.chassis.handle) mounts.push(a.local);
  mounts.push(...built.mounts);
  // one plate per distinct point
  const seen = new Set<string>();
  const uniqueMounts = mounts.filter((m) => {
    const key = m.map((x) => x.toFixed(3)).join(',');
    return !seen.has(key) && !!seen.add(key);
  });
  return {
    spec,
    bodyCount: bodies.length,
    chassis: idx(built.chassis),
    corners: built.corners.map((c) => ({
      id: c.id,
      wheel: idx(c.wheel),
      wheelSpec: c.axle.wheel,
      knuckle: idx(c.knuckle ?? c.carrier),
    })),
    links: built.corners.flatMap((c) => c.visuals.map((v) => ({ kind: v.kind, a: point(v.a), b: point(v.b) }))),
    joints: built.joints
      .filter((j) => index.has(j.body.handle))
      .map((j) => ({ kind: j.kind, at: point({ body: j.body, local: j.local }), axis: j.axis })),
    mounts: uniqueMounts,
  };
}
