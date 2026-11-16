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

/** Height fields kept after a tile left the window (66 KB each): driving back needs no recomputation */
const HEIGHT_CACHE = 24;
const WANT = (2 * PHYSICS_TILE_RADIUS + 1) ** 2;

/**
 * Streamt (2r+1)² Heightfield-Kacheln (64 m, 128 Zellen) um das Fahrzeug.
 * Die Kachel unter dem Fahrzeug wird sofort gebaut; Nachbarn stückweise mit festem Budget pro Aufruf
 * (`sampleBudget` Punkte), damit kein Physik-Schritt hängt – das Terrain kostet ~1 µs pro Punkt.
 * Nachbarn in Fahrtrichtung kommen zuerst; fertige Höhenfelder bleiben in einem kleinen LRU-Cache.
 * Beim Origin-Shift wandern die Körper mit der Welt.
 * Später: gröbere Ringe für ferne Objekte über dieselbe Höhenfunktion.
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

  /** true, solange noch Nachbarkacheln entstehen */
  get busy(): boolean {
    return this.job !== null;
  }

  /**
   * lokale Fahrzeug-Position → fehlende Kacheln bauen, ferne entfernen.
   * sampleBudget = Infinity: alles sofort (Spawn, Tests).
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
    // Normalfall (jeder Physik-Schritt): gleiche Kachel, alles da, nichts in Arbeit → nichts zu tun
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
    // Nachbarn in Fahrtrichtung zuerst (Skalarprodukt Kachel-Offset · Bewegung), stabil sortiert
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
    const key = `${ix},${iz}`;
    const cached = this.heights.get(key);
    if (cached) return { key, ix, iz, h: cached, col: S1 };
    return { key, ix, iz, h: new Float32Array(S1 * S1), col: 0 };
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
