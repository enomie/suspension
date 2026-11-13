import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { ChassisSpec } from '../types';
import { CHASSIS_GROUPS } from '../groups';
import { IDENTITY_ROT } from './context';

/** Chassis = gefederte Masse. Box-Collider, Schwerpunkt per comOffset. */
export function createChassis(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: ChassisSpec,
  pos: { x: number; y: number; z: number },
): RAPIER.RigidBody {
  const [w, h, l] = spec.size;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setCanSleep(false),
  );
  const m = spec.mass;
  const inertia = {
    x: (m / 12) * (h * h + l * l),
    y: (m / 12) * (w * w + l * l),
    z: (m / 12) * (w * w + h * h),
  };
  const [cx, cy, cz] = spec.comOffset ?? [0, 0, 0];
  const desc = R.ColliderDesc.cuboid(w / 2, h / 2, l / 2)
    .setMassProperties(m, { x: cx, y: cy, z: cz }, inertia, IDENTITY_ROT)
    .setFriction(0.5)
    .setCollisionGroups(CHASSIS_GROUPS);
  world.createCollider(desc, body);
  return body;
}
