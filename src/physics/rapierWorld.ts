import RAPIER from '@dimforge/rapier3d-simd-compat';

let initPromise: Promise<typeof RAPIER> | null = null;

export async function initRapier(): Promise<typeof RAPIER> {
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => RAPIER);
  }
  return initPromise;
}

export function createPhysicsWorld(R: typeof RAPIER): RAPIER.World {
  const gravity = { x: 0, y: -9.81, z: 0 };
  return new R.World(gravity);
}
