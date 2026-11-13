import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { ORIGIN } from '../shared/origin';
import { sampleGrid } from '../shared/terrainHeight';
import { CELL, PHYSICS_TILE_RADIUS, PHYSICS_TILE_SEGMENTS, PHYSICS_TILE_SIZE } from '../shared/config';

/**
 * Heightfield-Kachel (absolutes Raster, 0,5 m). Rapier: Spalten entlang X, Zeilen entlang Z,
 * column-major, Kollider zentriert auf den Körper.
 */
export function tileHeights(ix: number, iz: number): Float32Array {
  const n = PHYSICS_TILE_SEGMENTS;
  const g = sampleGrid(ix * PHYSICS_TILE_SIZE, iz * PHYSICS_TILE_SIZE, CELL, n); // Zeile = Z
  const h = new Float32Array((n + 1) * (n + 1));
  for (let col = 0; col <= n; col++) for (let row = 0; row <= n; row++) h[col * (n + 1) + row] = g[row * (n + 1) + col];
  return h;
}

/**
 * Streamt (2r+1)² Heightfield-Kacheln (64 m) um das Fahrzeug. Beim Origin-Shift wandern die Körper mit der Welt.
 * Später: gröbere Ringe (Zellweite 2^k · 0,5 m) für ferne Objekte – gleiche Abtastpunkte über `sampleGrid`.
 */
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
    const cx = Math.floor((localX + ORIGIN.x) / PHYSICS_TILE_SIZE);
    const cz = Math.floor((localZ + ORIGIN.z) / PHYSICS_TILE_SIZE);
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
    const n = PHYSICS_TILE_SEGMENTS;
    const S = PHYSICS_TILE_SIZE;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation((ix + 0.5) * S - ORIGIN.x, 0, (iz + 0.5) * S - ORIGIN.z),
    );
    world.createCollider(
      R.ColliderDesc.heightfield(n, n, tileHeights(ix, iz), { x: S, y: 1, z: S }).setFriction(this.friction),
      body,
    );
    return body;
  }
}
