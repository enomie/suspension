import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { ORIGIN } from '../world/origin';
import { sampleTerrainHeightWorld } from './generateHeights';
import { PHYSICS_TILE_RADIUS, TILE_SEGMENTS, TILE_SIZE } from './terrainConfig';

/**
 * Heightfield-Kachel (absolutes Raster). Rapier: Spalten entlang X, Zeilen entlang Z,
 * column-major, Kollider zentriert auf den Körper.
 */
export function tileHeights(ix: number, iz: number): Float32Array {
  const n = TILE_SEGMENTS;
  const h = new Float32Array((n + 1) * (n + 1));
  const x0 = ix * TILE_SIZE;
  const z0 = iz * TILE_SIZE;
  const d = TILE_SIZE / n;
  for (let col = 0; col <= n; col++) {
    for (let row = 0; row <= n; row++) {
      h[col * (n + 1) + row] = sampleTerrainHeightWorld(x0 + col * d, z0 + row * d);
    }
  }
  return h;
}

/** Streamt (2r+1)² Heightfield-Kacheln um einen Punkt. Beim Origin-Shift wandern die Körper mit der Welt. */
export class PhysicsTiles {
  private tiles = new Map<string, RAPIER.RigidBody>();

  constructor(
    private R: typeof RAPIER,
    private world: RAPIER.World,
    private friction = 0.95,
  ) {}

  get count(): number {
    return this.tiles.size;
  }

  /** lokale Position des Fahrzeugs → fehlende Kacheln bauen, ferne entfernen */
  update(localX: number, localZ: number): void {
    const ax = localX + ORIGIN.x;
    const az = localZ + ORIGIN.z;
    const cx = Math.floor(ax / TILE_SIZE);
    const cz = Math.floor(az / TILE_SIZE);
    const want = new Set<string>();
    const r = PHYSICS_TILE_RADIUS;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        want.add(key);
        if (!this.tiles.has(key)) this.tiles.set(key, this.build(cx + dx, cz + dz));
      }
    }
    for (const [key, body] of this.tiles) {
      if (!want.has(key)) {
        this.world.removeRigidBody(body);
        this.tiles.delete(key);
      }
    }
  }

  private build(ix: number, iz: number): RAPIER.RigidBody {
    const { R, world } = this;
    const n = TILE_SEGMENTS;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(
        (ix + 0.5) * TILE_SIZE - ORIGIN.x,
        0,
        (iz + 0.5) * TILE_SIZE - ORIGIN.z,
      ),
    );
    const desc = R.ColliderDesc.heightfield(n, n, tileHeights(ix, iz), { x: TILE_SIZE, y: 1, z: TILE_SIZE }).setFriction(
      this.friction,
    );
    world.createCollider(desc, body);
    return body;
  }
}
