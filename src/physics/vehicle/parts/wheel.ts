import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { WheelSpec } from '../types';
import { WHEEL_GROUPS } from '../groups';

/** wheel = own rigid body with collider (sphere or round cylinder on X). */
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
  if (spec.shape === 'roundCylinder') {
    const border = Math.min(spec.width * 0.3, spec.radius * 0.3);
    const s = Math.SQRT1_2;
    desc = R.ColliderDesc.roundCylinder(spec.width / 2 - border, spec.radius - border, border)
      .setRotation({ x: 0, y: 0, z: s, w: s });
  } else {
    desc = R.ColliderDesc.ball(spec.radius);
  }
  desc.setMass(spec.mass).setFriction(spec.friction).setCollisionGroups(WHEEL_GROUPS);
  world.createCollider(desc, body);
  return body;
}
