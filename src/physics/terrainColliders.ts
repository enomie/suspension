import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { ORIGIN } from '../shared/origin';
import { sampleTerrainHeightWorld } from '../shared/terrainHeight';
import { CELL, PHYSICS_TILE_RADIUS, PHYSICS_TILE_SEGMENTS, PHYSICS_TILE_SIZE } from '../shared/config';

const S1 = PHYSICS_TILE_SEGMENTS + 1;

/** heights of a physics tile in Rapier order (column = X, column-major), full resolution */
function fillColumns(h: Float32Array, ix: number, iz: number, fromCol: number, toCol: number): void {
  const x0 = ix * PHYSICS_TILE_SIZE;
  const z0 = iz * PHYSICS_TILE_SIZE;
  for (let col = fromCol; col < toCol; col++)
    for (let row = 0; row < S1; row++) h[col * S1 + row] = sampleTerrainHeightWorld(x0 + col * CELL, z0 + row * CELL);
}

interface Job {
  key: string;
  ix: number;
  iz: number;
  h: Float32Array;
  col: number;
}

/** Height fields kept after a tile left the window (66 KB each): driving back needs no recomputation */
const HEIGHT_CACHE = 24;
const WANT = (2 * PHYSICS_TILE_RADIUS + 1) ** 2;

/**
 * Streams (2r+1)² heightfield tiles (64 m, 128 cells) around the vehicle.
 * Tile under the vehicle is built immediately; neighbours incrementally with fixed budget per call
 * (`sampleBudget` samples) so no physics step stalls — terrain costs ~1 µs per sample.
 * Neighbours ahead in travel direction first; finished heightfields stay in a small LRU cache.
 * On origin shift, bodies move with the world.
 * Later: coarser rings for distant objects via the same height function.
 */
export class PhysicsTiles {
  private tiles = new Map<string, RAPIER.RigidBody>();
  private job: Job | null = null;
  /** finished height fields, least recently used first */
  private heights = new Map<string, Float32Array>();
  /** tile cell of the last full pass (NaN = none yet) */
  private cx = NaN;
  private cz = NaN;
  /** last absolute position → direction of travel */
  private lastAbsX = NaN;
  private lastAbsZ = NaN;

  constructor(
    private R: typeof RAPIER,
    private world: RAPIER.World,
    private friction = 0.95,
  ) {}

  get count(): number {
    return this.tiles.size;
  }

  /** true while neighbour tiles are still being built */
  get busy(): boolean {
    return this.job !== null;
  }

  /**
   * local vehicle position → build missing tiles, remove distant ones.
   * sampleBudget = Infinity: everything immediately (spawn, tests).
   */
  update(localX: number, localZ: number, sampleBudget = Infinity): void {
    const ax = localX + ORIGIN.x;
    const az = localZ + ORIGIN.z;
    const dirX = ax - this.lastAbsX || 0;
    const dirZ = az - this.lastAbsZ || 0;
    this.lastAbsX = ax;
    this.lastAbsZ = az;
    const cx = Math.floor(ax / PHYSICS_TILE_SIZE);
    const cz = Math.floor(az / PHYSICS_TILE_SIZE);
    // normal case (each physics step): same tile, all present, nothing in progress → noop
    if (cx === this.cx && cz === this.cz && !this.job && this.tiles.size === WANT) return;
    this.cx = cx;
    this.cz = cz;

    const r = PHYSICS_TILE_RADIUS;
    const want = new Set<string>();
    const missing: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        want.add(key);
        if ((dx || dz) && !this.tiles.has(key)) missing.push([cx + dx, cz + dz]);
      }
    // neighbours in travel direction first (tile offset · motion dot product), stable sort
    if (dirX || dirZ) {
      const ahead = (t: [number, number]) => (t[0] - cx) * dirX + (t[1] - cz) * dirZ;
      missing.sort((a, b) => ahead(b) - ahead(a));
    }
    for (const [key, body] of this.tiles)
      if (!want.has(key)) {
        this.world.removeRigidBody(body);
        this.tiles.delete(key);
      }
    if (this.job && !want.has(this.job.key)) this.job = null;

    // tile under vehicle: immediately (finish or build complete)
    const centerKey = `${cx},${cz}`;
    if (!this.tiles.has(centerKey)) {
      const job = this.job?.key === centerKey ? this.job : this.newJob(cx, cz);
      this.advance(job, Infinity);
    }
    // neighbours: incrementally
    let budget = sampleBudget;
    for (const [ix, iz] of missing) {
      if (budget <= 0) break;
      const key = `${ix},${iz}`;
      if (this.tiles.has(key)) continue;
      if (!this.job || this.job.key !== key) {
        if (this.job) continue; // finish running job first
        this.job = this.newJob(ix, iz);
      }
      budget = this.advance(this.job, budget);
    }
  }

  private newJob(ix: number, iz: number): Job {
    const key = `${ix},${iz}`;
    const cached = this.heights.get(key);
    if (cached) return { key, ix, iz, h: cached, col: S1 };
    return { key, ix, iz, h: new Float32Array(S1 * S1), col: 0 };
  }

  /** samples up to `budget` points; returns remaining budget */
  private advance(job: Job, budget: number): number {
    const cols = budget === Infinity ? S1 - job.col : Math.max(1, Math.floor(budget / S1));
    const to = Math.min(S1, job.col + cols);
    fillColumns(job.h, job.ix, job.iz, job.col, to);
    budget -= (to - job.col) * S1;
    job.col = to;
    if (job.col >= S1) {
      this.tiles.set(job.key, this.build(job));
      this.remember(job);
      if (this.job === job) this.job = null;
    }
    return budget;
  }

  /** finished height field into the LRU cache (most recent last) */
  private remember(job: Job): void {
    this.heights.delete(job.key);
    this.heights.set(job.key, job.h);
    if (this.heights.size > HEIGHT_CACHE) this.heights.delete(this.heights.keys().next().value!);
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
