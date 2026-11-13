import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { ORIGIN } from '../shared/origin';
import { sampleTerrainHeightWorld } from '../shared/terrainHeight';
import { CELL, PHYSICS_TILE_RADIUS, PHYSICS_TILE_SEGMENTS, PHYSICS_TILE_SIZE } from '../shared/config';

const S1 = PHYSICS_TILE_SEGMENTS + 1;

/** Höhen einer Physik-Kachel in Rapier-Reihenfolge (Spalte = X, column-major), volle Auflösung */
function fillColumns(h: Float32Array, ix: number, iz: number, fromCol: number, toCol: number): void {
  const x0 = ix * PHYSICS_TILE_SIZE;
  const z0 = iz * PHYSICS_TILE_SIZE;
  for (let col = fromCol; col < toCol; col++)
    for (let row = 0; row < S1; row++) h[col * S1 + row] = sampleTerrainHeightWorld(x0 + col * CELL, z0 + row * CELL);
}

/** Heightfield-Kachel (absolutes Raster, 0,5 m), komplett */
export function tileHeights(ix: number, iz: number): Float32Array {
  const h = new Float32Array(S1 * S1);
  fillColumns(h, ix, iz, 0, S1);
  return h;
}

interface Job {
  key: string;
  ix: number;
  iz: number;
  h: Float32Array;
  col: number;
}

/**
 * Streamt (2r+1)² Heightfield-Kacheln (64 m, 128 Zellen) um das Fahrzeug.
 * Die Kachel unter dem Fahrzeug wird sofort gebaut; Nachbarn stückweise mit festem Budget pro Aufruf
 * (`sampleBudget` Punkte), damit kein Physik-Schritt hängt – das Terrain kostet ~1 µs pro Punkt.
 * Beim Origin-Shift wandern die Körper mit der Welt.
 * Später: gröbere Ringe für ferne Objekte über dieselbe Höhenfunktion.
 */
export class PhysicsTiles {
  private tiles = new Map<string, RAPIER.RigidBody>();
  private job: Job | null = null;

  constructor(
    private R: typeof RAPIER,
    private world: RAPIER.World,
    private friction = 0.95,
  ) {}

  get count(): number {
    return this.tiles.size;
  }

  /** true, solange noch Nachbarkacheln entstehen */
  get busy(): boolean {
    return this.job !== null;
  }

  /**
   * lokale Fahrzeug-Position → fehlende Kacheln bauen, ferne entfernen.
   * sampleBudget = Infinity: alles sofort (Spawn, Tests).
   */
  update(localX: number, localZ: number, sampleBudget = Infinity): void {
    const cx = Math.floor((localX + ORIGIN.x) / PHYSICS_TILE_SIZE);
    const cz = Math.floor((localZ + ORIGIN.z) / PHYSICS_TILE_SIZE);
    const r = PHYSICS_TILE_RADIUS;
    const want = new Set<string>();
    const missing: [number, number][] = [];
    // mittlere Kachel zuerst, dann die Nachbarn
    const order: [number, number][] = [[0, 0]];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx || dz) order.push([dx, dz]);
    for (const [dx, dz] of order) {
      const key = `${cx + dx},${cz + dz}`;
      want.add(key);
      if (!this.tiles.has(key)) missing.push([cx + dx, cz + dz]);
    }
    for (const [key, body] of this.tiles)
      if (!want.has(key)) {
        this.world.removeRigidBody(body);
        this.tiles.delete(key);
      }
    if (this.job && !want.has(this.job.key)) this.job = null;

    // Kachel unter dem Fahrzeug: sofort (fertigstellen bzw. komplett bauen)
    const centerKey = `${cx},${cz}`;
    if (!this.tiles.has(centerKey)) {
      const job = this.job?.key === centerKey ? this.job : this.newJob(cx, cz);
      this.advance(job, Infinity);
    }
    // Nachbarn: stückweise
    let budget = sampleBudget;
    for (const [ix, iz] of missing) {
      if (budget <= 0) break;
      const key = `${ix},${iz}`;
      if (this.tiles.has(key)) continue;
      if (!this.job || this.job.key !== key) {
        if (this.job) continue; // laufenden Auftrag erst fertig machen
        this.job = this.newJob(ix, iz);
      }
      budget = this.advance(this.job, budget);
    }
  }

  private newJob(ix: number, iz: number): Job {
    return { key: `${ix},${iz}`, ix, iz, h: new Float32Array(S1 * S1), col: 0 };
  }

  /** rechnet bis zu `budget` Punkte; gibt das Restbudget zurück */
  private advance(job: Job, budget: number): number {
    const cols = budget === Infinity ? S1 - job.col : Math.max(1, Math.floor(budget / S1));
    const to = Math.min(S1, job.col + cols);
    fillColumns(job.h, job.ix, job.iz, job.col, to);
    budget -= (to - job.col) * S1;
    job.col = to;
    if (job.col >= S1) {
      this.tiles.set(job.key, this.build(job));
      if (this.job === job) this.job = null;
    }
    return budget;
  }

  private build(job: Job): RAPIER.RigidBody {
    const { R, world } = this;
    const n = PHYSICS_TILE_SEGMENTS;
    const S = PHYSICS_TILE_SIZE;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation((job.ix + 0.5) * S - ORIGIN.x, 0, (job.iz + 0.5) * S - ORIGIN.z),
    );
    world.createCollider(R.ColliderDesc.heightfield(n, n, job.h, { x: S, y: 1, z: S }).setFriction(this.friction), body);
    return body;
  }
}
