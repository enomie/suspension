import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { WheelSpec } from '../types';
import { WHEEL_GROUPS } from '../groups';
import { torusAxialScale, torusHullBorder, torusHullPoints } from '../../../shared/unitTorus';

/** edge radius of a cylinder wheel [m] */
const CYLINDER_EDGE_RADIUS = 0.05;

/** wheel = own rigid body with collider (round cylinder on X or torus hull). */
export function createWheel(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: WheelSpec,
  pos: { x: number; y: number; z: number },
): RAPIER.RigidBody {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  let desc: RAPIER.ColliderDesc;
  if (spec.shape === 'torus') {
    // exactly as apokalypto: round convex hull of the unit-torus mesh, scaled to the wheel diameter (axial scale from the width)
    const d = spec.radius * 2;
    const axial = torusAxialScale(spec.width);
    const hull = R.ColliderDesc.roundConvexHull(torusHullPoints(d, axial), torusHullBorder(Math.min(d, axial)));
    if (!hull) throw new Error('wheel: torus hull failed');
    desc = hull;
  } else {
    // cylinder on X, edges rounded with a fixed radius
    const border = Math.min(CYLINDER_EDGE_RADIUS, spec.width / 2, spec.radius);
    const s = Math.SQRT1_2;
    desc = R.ColliderDesc.roundCylinder(spec.width / 2 - border, spec.radius - border, border).setRotation({ x: 0, y: 0, z: s, w: s });
  }
  desc.setMass(spec.mass).setFriction(spec.friction).setCollisionGroups(WHEEL_GROUPS);
  world.createCollider(desc, body);
  return body;
}
