import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { HEIGHTFIELD_SCALE, TERRAIN_COLS, TERRAIN_ROWS } from '../terrain/terrainConfig';
import { generateHeightfieldHeights } from '../terrain/generateHeights';

export type HeightfieldColliderResult = {
  heights: Float32Array;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
};

/** Rapier heightfield in XZ — with scale = terrain size, origin matches centered Three.js mesh. */
export function createHeightfieldCollider(
  world: RAPIER.World,
  R: typeof RAPIER,
  heightsInput?: Float32Array,
): HeightfieldColliderResult {
  const heights = heightsInput ?? generateHeightfieldHeights();

  const expected = (TERRAIN_ROWS + 1) * (TERRAIN_COLS + 1);
  if (heights.length !== expected) {
    throw new Error(`Heightfield length ${heights.length} !== ${expected}`);
  }

  const scale = new R.Vector3(HEIGHTFIELD_SCALE.x, HEIGHTFIELD_SCALE.y, HEIGHTFIELD_SCALE.z);
  const desc = R.ColliderDesc.heightfield(TERRAIN_ROWS, TERRAIN_COLS, heights, scale).setFriction(
    0.95,
  );

  const bodyDesc = R.RigidBodyDesc.fixed();
  const body = world.createRigidBody(bodyDesc);
  const collider = world.createCollider(desc, body);

  return { heights, body, collider };
}
