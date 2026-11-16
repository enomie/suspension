import { BatchedMesh, BufferAttribute, BufferGeometry, Matrix4, type Camera, type Material, type PerspectiveCamera } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { terrainMaterial } from '../tsl/terrainMaterial';
import { ORIGIN } from '../../shared/origin';
import { sampleTerrainHeightWorld } from '../../shared/terrainHeight';
import { buildTileArrays, buildTileIndex, TILE_VERTS, tileSize, type TileArrays } from '../../shared/tileGeometry';
import type { TileRequest, TileWorkerMessage } from './tileWorker';
import { terrain } from '../../shared/terrain';
import { MAX_LOD, VIEW_DISTANCE, lodSplit } from '../../shared/config';

/** tile slots in BatchedMesh (visible ~150, rest = cache) */
const SLOTS = 320;
const INDEX = buildTileIndex();

/** Numeric tile id (no string allocation in the per-frame selection): lod · 2^44 + (ix + 2^21) · 2^22 + (iz + 2^21) */
const OFFSET = 2 ** 21;
const SPAN = 2 ** 22;
const tileId = (lod: number, ix: number, iz: number) => (lod * SPAN + ix + OFFSET) * SPAN + iz + OFFSET;

interface Chunk {
  /** Numeric id (map key) */
  id: number;
  /** "lod,ix,iz" – for tests, debugging and worker messages */
  key: string;
  lod: number;
  ix: number;
  iz: number;
  /** slot in BatchedMesh (geometry index = instance index) */
  slot: number;
  /** height span [min, max] (absolute = local, y is not shifted) */
  minY: number;
  maxY: number;
  lastUsed: number;
}

/**
 * Infinite LOD terrain: quadtree of tiles with 64×64 segments each, edge 32 m · 2^k.
 * LOD 0 = 0.5 m grid = physics grid (same samples, same diagonal). Fine to ~2 km
 * (`lodSplit`), then coarse to 32 km. ALL tiles in ONE BatchedMesh → 1 draw call.
 * Tiles computed in worker pool (coarse first, near first); without workers sync with time budget.
 */
export class LodTerrain {
  readonly material = terrainMaterial();
  readonly mesh: BatchedMesh;
  /** scene root (= the BatchedMesh) */
  get root(): BatchedMesh {
    return this.mesh;
  }
  private cache = new Map<number, Chunk>();
  private freeSlots: number[] = [];
  private queue: { lod: number; ix: number; iz: number; d: number }[] = [];
  private frame = 0;
  /** nodes split in the last pass (for hysteresis) */
  private splitSet = new Set<number>();
  private inView = new Set<number>();
  /** build budget per frame [ms] (only without workers) */
  budgetMs = 3;
  stats = { visible: 0, cached: 0, built: 0, queue: 0, drawCalls: 1 };
  /** debug: freeze selection */
  frozen = false;

  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private pending = new Set<number>();
  /** worker → tile currently being built (for errors / timeout) */
  private busy = new Map<Worker, { id: number; since: number }>();
  /** workers silent this long are considered hung [ms] */
  workerTimeoutMs = 5000;
  private dirty = true;
  private lastCam = { x: NaN, y: NaN, z: NaN };
  private visible = new Set<Chunk>();
  private _m = new Matrix4();

  constructor(workerCount = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1))) {
    const idx = INDEX.length;
    this.mesh = new BatchedMesh(SLOTS, SLOTS * TILE_VERTS, SLOTS * idx, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // overall bounds change constantly
    /**
     * No per-tile culling by three.js: draw list is recomputed per pass (shadow, main view),
     * but indirect texture uploaded once → main view draws stale list, tiles missing.
     * Visibility controlled by `update()` (LOD + view range); draw list built in `beforeRender()` once per frame.
     */
    this.mesh.perObjectFrustumCulled = false;
    this.mesh.sortObjects = false;
    // reserve slots once (adding new ones would burn buffer memory), then only overwrite
    const blank = this.geometryFrom(buildTileArrays(MAX_LOD, 1e6, 1e6));
    for (let s = 0; s < SLOTS; s++) {
      const g = this.mesh.addGeometry(blank, TILE_VERTS, idx);
      const i = this.mesh.addInstance(g);
      this.mesh.setVisibleAt(i, false);
      this.freeSlots.push(s);
    }
    blank.dispose();

    if (typeof Worker === 'undefined') return;
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      // same terrain config as this thread
      w.postMessage({ type: 'terrain', config: terrain().config } satisfies TileWorkerMessage);
      w.onmessage = (e: MessageEvent<TileRequest & TileArrays>) => {
        const { key, lod, ix, iz } = e.data;
        this.pending.delete(tileId(lod, ix, iz));
        this.busy.delete(w);
        this.idle.push(w);
        this.addChunk(key, lod, ix, iz, e.data);
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        console.error('[terrain] tile worker failed — building on main thread', e.message ?? e);
        this.dropWorker(w);
      };
      w.onmessageerror = () => this.dropWorker(w);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private geometryFrom(a: TileArrays): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(a.position, 3));
    g.setAttribute('normal', new BufferAttribute(a.normal, 3));
    g.setAttribute('morph', new BufferAttribute(a.morph, 1));
    g.setAttribute('morphNormal', new BufferAttribute(a.morphNormal, 3));
    g.setAttribute('morphRange', new BufferAttribute(a.morphRange, 2));
    g.setAttribute('road', new BufferAttribute(a.road, 1));
    g.setIndex(new BufferAttribute(INDEX, 1));
    return g;
  }

  /** tile as standalone geometry (tests / analysis) */
  buildGeometry(lod: number, ix: number, iz: number): BufferGeometry {
    return this.geometryFrom(buildTileArrays(lod, ix, iz));
  }

  /** acquire slot: free, else evict longest-unused invisible tile */
  private takeSlot(): number | null {
    if (this.freeSlots.length) return this.freeSlots.pop()!;
    let oldest: Chunk | null = null;
    for (const c of this.cache.values())
      if (!this.visible.has(c) && (!oldest || c.lastUsed < oldest.lastUsed)) oldest = c;
    if (!oldest) return null;
    this.cache.delete(oldest.id);
    return oldest.slot;
  }

  private addChunk(key: string, lod: number, ix: number, iz: number, a: TileArrays): void {
    const id = tileId(lod, ix, iz);
    if (this.cache.has(id)) return;
    const slot = this.takeSlot();
    if (slot === null) return; // full — retries next pass
    const g = this.geometryFrom(a);
    this.mesh.setGeometryAt(slot, g);
    g.dispose();
    this.mesh.setVisibleAt(slot, false);
    const c: Chunk = { id, key, lod, ix, iz, slot, lastUsed: this.frame, minY: a.bounds[0], maxY: a.bounds[1] };
    this.place(c);
    this.cache.set(id, c);
    this.dirty = true;
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.mesh.dispose();
    this.material.dispose();
    this.cache.clear();
  }

  private place(c: Chunk): void {
    const size = tileSize(c.lod);
    this._m.makeTranslation((c.ix + 0.5) * size - ORIGIN.x, 0, (c.iz + 0.5) * size - ORIGIN.z);
    this.mesh.setMatrixAt(c.slot, this._m);
  }

  /** after floating-origin shift, reposition all tiles */
  onOriginShift(): void {
    for (const c of this.cache.values()) this.place(c);
    this.dirty = true;
  }

  /** debug: wireframe */
  set wireframe(on: boolean) {
    this.material.wireframe = on;
  }

  /** visible tiles as "lod,ix,iz" (tests / debug) */
  visibleKeys(): string[] {
    return [...this.visible].map((c) => c.key).sort();
  }

  /**
   * Once per frame before `renderer.render`: build draw list from current visibility and
   * mark indirect texture for upload. Then `_visibilityChanged` is false; all passes
   * (shadow + main, WebGPU and WebGL fallback) draw the same up-to-date list.
   */
  beforeRender(renderer: WebGPURenderer, camera: PerspectiveCamera): void {
    const m = this.mesh as BatchedMesh & {
      _visibilityChanged: boolean;
      _indirectTexture: { needsUpdate: boolean } | null;
      _updateDrawParameters(camera: Camera, geometry: BufferGeometry, material: Material, format?: string): void;
    };
    if (!m._visibilityChanged) return;
    const webgpu = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
    m._updateDrawParameters(camera, m.geometry, this.material, webgpu ? 'merged' : 'multiDraw');
    if (m._indirectTexture) m._indirectTexture.needsUpdate = true;
  }

  /** remove worker (error / hung); without workers update() builds on main thread. */
  private dropWorker(w: Worker): void {
    const job = this.busy.get(w);
    if (job) this.pending.delete(job.id);
    this.busy.delete(w);
    w.terminate();
    this.workers = this.workers.filter((x) => x !== w);
    this.idle = this.idle.filter((x) => x !== w);
    this.dirty = true;
  }

  /** camera (local) → select tiles, build, toggle visibility. */
  update(camX: number, camY: number, camZ: number): void {
    this.frame++;
    const now = performance.now();
    for (const [w, job] of this.busy)
      if (now - job.since > this.workerTimeoutMs) {
        console.error('[terrain] tile worker not responding — building on main thread', job.id);
        this.dropWorker(w);
      }
    const moved = Math.abs(camX - this.lastCam.x) + Math.abs(camY - this.lastCam.y) + Math.abs(camZ - this.lastCam.z);
    if (this.frozen || (!this.dirty && moved < 0.25 && this.queue.length === 0 && this.pending.size === 0)) {
      if (this.frame % 60 === 0) for (const c of this.visible) c.lastUsed = this.frame;
      this.stats.built = 0;
      return;
    }
    this.dirty = false;
    this.lastCam = { x: camX, y: camY, z: camZ };
    const ax = camX + ORIGIN.x;
    const az = camZ + ORIGIN.z;
    const camH = Math.max(0, camY - sampleTerrainHeightWorld(ax, az));
    const rootSize = tileSize(MAX_LOD);

    const visible = new Set<Chunk>();
    const want: { lod: number; ix: number; iz: number; d: number }[] = [];
    const key = tileId;
    const ready = (lod: number, ix: number, iz: number) => this.cache.has(tileId(lod, ix, iz));
    /**
     * camera ↔ tile distance in 3D: uses tile height span (mountain 2 km higher counts).
     * tile not built yet: camera height above ground below as approximation.
     */
    const dist = (lod: number, ix: number, iz: number) => {
      const s = tileSize(lod);
      const dx = Math.max(0, Math.abs(ax - (ix + 0.5) * s) - s / 2);
      const dz = Math.max(0, Math.abs(az - (iz + 0.5) * s) - s / 2);
      const c = this.cache.get(key(lod, ix, iz));
      const dy = c ? Math.max(0, c.minY - camY, camY - c.maxY) : camH;
      return Math.sqrt(dx * dx + dz * dz + dy * dy);
    };
    /** view-range boundary with hysteresis too (else oscillation at fog edge) */
    const nextInView = new Set<number>();
    const outOfView = (lod: number, ix: number, iz: number) => {
      const k = key(lod, ix, iz);
      const out = dist(lod, ix, iz) > VIEW_DISTANCE * (this.inView.has(k) ? 1.05 : 1);
      if (!out) nextInView.add(k);
      return out;
    };
    /** split with hysteresis: once split, merge only at +15% distance */
    const nextSplit = new Set<number>();
    const split = (lod: number, ix: number, iz: number) => {
      if (lod === 0) return false;
      const k = key(lod, ix, iz);
      const f = this.splitSet.has(k) ? 1.15 : 1;
      const yes = dist(lod, ix, iz) < lodSplit(lod) * f * tileSize(lod);
      if (yes) nextSplit.add(k);
      return yes;
    };
    const children = (lod: number, ix: number, iz: number) =>
      [0, 1, 2, 3].map((k) => [lod - 1, ix * 2 + (k & 1), iz * 2 + (k >> 1)] as const);
    const request = (lod: number, ix: number, iz: number) => {
      if (!ready(lod, ix, iz)) want.push({ lod, ix, iz, d: dist(lod, ix, iz) });
    };
    /**
     * refine level by level: a tile is replaced by its 4 children only when all 4 are ready.
     * If a child is missing, ONLY this tile stays (not the whole subtree to root) and children
     * are requested. While driving at most one LOD level is briefly missing — no large pops.
     */
    const select = (lod: number, ix: number, iz: number): void => {
      if (outOfView(lod, ix, iz)) return;
      const c = this.cache.get(key(lod, ix, iz));
      if (!c) return request(lod, ix, iz); // parent stays visible (see below)
      c.lastUsed = this.frame;
      if (split(lod, ix, iz)) {
        const kids = children(lod, ix, iz).filter(([l, x, z]) => !outOfView(l, x, z));
        const kidChunks = kids.map(([l, x, z]) => this.cache.get(key(l, x, z)));
        for (const k of kidChunks) if (k) k.lastUsed = this.frame; // in use → do not evict
        if (kidChunks.every((k) => k)) {
          for (const [l, x, z] of kids) select(l, x, z);
          return;
        }
        for (const [l, x, z] of kids) request(l, x, z);
      }
      visible.add(c);
    };
    // all root tiles touching view range (no fixed 3×3 window → no pops at root boundaries)
    const R = VIEW_DISTANCE * 1.05;
    for (let z = Math.floor((az - R) / rootSize); z <= Math.floor((az + R) / rootSize); z++)
      for (let x = Math.floor((ax - R) / rootSize); x <= Math.floor((ax + R) / rootSize); x++)
        select(MAX_LOD, x, z);
    this.splitSet = nextSplit;
    this.inView = nextInView;

    // toggle visibility only on change (before build so visible tiles are not evicted)
    for (const c of this.visible) if (!visible.has(c) && this.cache.get(c.id) === c) this.mesh.setVisibleAt(c.slot, false);
    for (const c of visible) {
      c.lastUsed = this.frame;
      if (!this.visible.has(c)) this.mesh.setVisibleAt(c.slot, true);
    }
    this.visible = visible;

    // build queue: coarse before fine, near before far
    const seen = new Set<number>();
    this.queue = want.filter((w) => {
      const k = key(w.lod, w.ix, w.iz);
      return seen.has(k) ? false : (seen.add(k), true);
    });
    this.queue.sort((a, b) => b.lod - a.lod || a.d - b.d);
    let built = 0;
    if (this.workers.length) {
      for (const q of this.queue) {
        if (!this.idle.length) break;
        const k = key(q.lod, q.ix, q.iz);
        if (this.pending.has(k)) continue;
        this.pending.add(k);
        const w = this.idle.pop()!;
        this.busy.set(w, { id: k, since: performance.now() });
        w.postMessage({ type: 'tile', key: `${q.lod},${q.ix},${q.iz}`, lod: q.lod, ix: q.ix, iz: q.iz } satisfies TileRequest);
        built++;
      }
    } else {
      const t0 = performance.now();
      while (this.queue.length && (built === 0 || performance.now() - t0 < this.budgetMs)) {
        const q = this.queue.shift()!;
        this.addChunk(`${q.lod},${q.ix},${q.iz}`, q.lod, q.ix, q.iz, buildTileArrays(q.lod, q.ix, q.iz));
        built++;
      }
      if (built) this.dirty = true;
    }
    this.stats = { visible: visible.size, cached: this.cache.size, built, queue: this.queue.length, drawCalls: 1 };
  }
}

/** debug toggle lives in `render/tsl/terrainMaterial.ts`; re-exported here (legacy import path). */
export { morphEnabled } from '../tsl/terrainMaterial';
