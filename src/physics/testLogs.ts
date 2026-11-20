import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { ORIGIN } from '../shared/origin';
import type { LogSpec } from '../shared/testLogs';

/** Fixed cylinder colliders for the test logs (axis along X). Bodies move with the world on origin shift. */
export function addLogColliders(R: typeof RAPIER, world: RAPIER.World, logs: readonly LogSpec[], friction = 0.9): void {
  // Rapier cylinders have their axis along Y → rotate 90° about Z so the axis lies along X
  const s = Math.SQRT1_2;
  for (const l of logs) {
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(l.x - ORIGIN.x, l.y, l.z - ORIGIN.z).setRotation({ x: 0, y: 0, z: s, w: s }),
    );
    world.createCollider(R.ColliderDesc.cylinder(l.length / 2, l.radius).setFriction(friction), body);
  }
}
