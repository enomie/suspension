import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { IDENTITY_ROT } from './context';

/**
 * Kleiner Hilfskörper ohne Collider (Strut, Achsschenkel, Lenker).
 * Masse + Trägheit explizit, damit die Joint-Kette nicht zu leicht wird.
 */
export function createHelperBody(
  R: typeof RAPIER,
  world: RAPIER.World,
  pos: { x: number; y: number; z: number },
  mass: number,
  inertia: number,
): RAPIER.RigidBody {
  return world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setCanSleep(false)
      .setAdditionalMassProperties(
        mass,
        { x: 0, y: 0, z: 0 },
        { x: inertia, y: inertia, z: inertia },
        IDENTITY_ROT,
      ),
  );
}
