import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, cameraPosition, distance, float, modelWorldMatrix, positionLocal, smoothstep, vec3, vec4 } from 'three/tsl';
import { ORIGIN } from '../world/origin';
import { sampleTerrainHeightWorld } from './generateHeights';
import { buildTileArrays, buildTileIndex, type TileArrays } from './tileGeometry';
import type { TileRequest } from './terrainWorker';
import { LOD_SPLIT, MAX_LOD, TILE_SIZE, VIEW_DISTANCE } from './terrainConfig';

/**
 * Unendliches LOD-Terrain (Quadtree aus Kacheln mit je 64×64 Segmenten).
 * LOD 0 = 50 m Kachel, 0,78 m Raster = exakt das Physik-Raster (gleiche Dreiecks-Diagonale wie Rapier).
 * LOD k = 50 m · 2^k. Risse zwischen Stufen verdecken Schürzen (Skirts) an den Kachelrändern.
 * Kacheln werden in einem Worker-Pool berechnet (grob zuerst, nah zuerst) und gecacht;
 * ohne Worker (Node/Tests) synchron mit Zeitbudget.
 */
interface Chunk {
  key: string;
  lod: number;
  ix: number;
  iz: number;
  mesh: Mesh;
  lastUsed: number;
}

const INDEX = new BufferAttribute(buildTileIndex(), 1);

/**
 * CDLOD-Geomorphing im Vertex-Shader: ab ~1,2 Kachelkanten Abstand blendet jeder Vertex zur Höhe der
 * nächstgröberen Stufe; spätestens beim Zusammenfassen (Hysterese-Grenze) ist er vollständig dort.
 * Beim Teilen sehen die Kinder zunächst exakt wie der Elternteil aus → kein sichtbares Umschalten.
 */
function morphMaterial(lod: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: 0x4a6741, roughness: 0.92, metalness: 0.02, side: DoubleSide });
  const size = TILE_SIZE * 2 ** lod;
  const end = LOD_SPLIT * 2 * size;
  const start = end * 0.65;
  const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const k = smoothstep(float(start), float(end), distance(wp, cameraPosition));
  m.positionNode = positionLocal.add(vec3(0, attribute('morph', 'float').mul(k), 0));
  return m;
}

export class LodTerrain {
  readonly root = new Group();
  /** ein Material je LOD-Stufe (Morph-Bereich als Konstante im Shader) */
  readonly materials = Array.from({ length: MAX_LOD + 1 }, (_, lod) => morphMaterial(lod));
  private cache = new Map<string, Chunk>();
  private queue: { lod: number; ix: number; iz: number; d: number }[] = [];
  private queued = new Set<string>();
  private frame = 0;
  /** im letzten Frame geteilte Knoten (für Hysterese) */
  private splitSet = new Set<string>();
  /** Bau-Budget pro Frame [ms] */
  budgetMs = 3;
  stats = { visible: 0, cached: 0, built: 0, queue: 0 };

  /** Worker-Pool (leer in Umgebungen ohne Worker) */
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  /** in Arbeit befindliche Kacheln */
  private pending = new Set<string>();

  constructor(workerCount = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1))) {
    if (typeof Worker === 'undefined') return;
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<TileRequest & TileArrays>) => {
        const { key, lod, ix, iz } = e.data;
        this.pending.delete(key);
        this.idle.push(w);
        this.addChunk(key, lod, ix, iz, this.geometryFrom(e.data));
      };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private geometryFrom(a: TileArrays): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(a.position, 3));
    g.setAttribute('normal', new BufferAttribute(a.normal, 3));
    g.setAttribute('morph', new BufferAttribute(a.morph, 1));
    g.setIndex(INDEX);
    g.computeBoundingSphere();
    return g;
  }

  /** Kachel synchron bauen (Tests / Fallback) */
  buildGeometry(lod: number, ix: number, iz: number): BufferGeometry {
    return this.geometryFrom(buildTileArrays(lod, ix, iz));
  }

  private addChunk(key: string, lod: number, ix: number, iz: number, geo: BufferGeometry): void {
    const mesh = new Mesh(geo, this.materials[lod]);
    mesh.receiveShadow = true;
    // Terrain-Kacheln bewegen sich nur beim Origin-Shift → Matrix nur dann neu
    mesh.matrixAutoUpdate = false;
    const c: Chunk = { key, lod, ix, iz, mesh, lastUsed: this.frame };
    this.place(c);
    this.cache.set(key, c);
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const c of this.cache.values()) c.mesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.cache.clear();
  }

  private place(c: Chunk): void {
    const size = TILE_SIZE * 2 ** c.lod;
    c.mesh.position.set((c.ix + 0.5) * size - ORIGIN.x, 0, (c.iz + 0.5) * size - ORIGIN.z);
    c.mesh.updateMatrix();
    this.dirty = true;
  }

  /** nach Floating-Origin-Shift alle Kacheln neu platzieren */
  onOriginShift(): void {
    for (const c of this.cache.values()) this.place(c);
  }

  /** neue Kachel / Origin-Shift seit der letzten Auswahl */
  private dirty = true;
  private lastCam = { x: NaN, y: NaN, z: NaN };
  private attached = new Set<Chunk>();

  /** Kamera (lokal) → Kacheln wählen, bauen (Budget), sichtbar schalten. */
  update(camX: number, camY: number, camZ: number): void {
    this.frame++;
    // Auswahl nur neu, wenn sich etwas geändert hat (spart den Quadtree-Lauf bei stehender Kamera)
    const moved = Math.abs(camX - this.lastCam.x) + Math.abs(camY - this.lastCam.y) + Math.abs(camZ - this.lastCam.z);
    if (!this.dirty && moved < 0.25 && this.queue.length === 0 && this.pending.size === 0) {
      if (this.frame % 60 === 0) for (const c of this.attached) c.lastUsed = this.frame;
      this.stats.built = 0;
      return;
    }
    this.dirty = false;
    this.lastCam = { x: camX, y: camY, z: camZ };
    const ax = camX + ORIGIN.x;
    const az = camZ + ORIGIN.z;
    const groundY = sampleTerrainHeightWorld(ax, az);
    const camH = Math.max(0, camY - groundY);
    const rootSize = TILE_SIZE * 2 ** MAX_LOD;
    const rx = Math.floor(ax / rootSize);
    const rz = Math.floor(az / rootSize);

    const visible = new Set<Chunk>();
    const want: { lod: number; ix: number; iz: number; d: number }[] = [];

    const ready = (lod: number, ix: number, iz: number) => this.cache.has(`${lod},${ix},${iz}`);
    const dist = (lod: number, ix: number, iz: number) => {
      const s = TILE_SIZE * 2 ** lod;
      const cx = (ix + 0.5) * s;
      const cz = (iz + 0.5) * s;
      // Abstand zur Kachel (0 innerhalb), Kamerahöhe zählt mit
      const dx = Math.max(0, Math.abs(ax - cx) - s / 2);
      const dz = Math.max(0, Math.abs(az - cz) - s / 2);
      return Math.hypot(dx, dz, camH);
    };
    /** Teilen mit Hysterese: einmal geteilt erst bei +15 % Abstand wieder zusammenfassen (kein Pendeln) */
    const nextSplit = new Set<string>();
    const split = (lod: number, ix: number, iz: number) => {
      if (lod === 0) return false;
      const key = `${lod},${ix},${iz}`;
      const f = this.splitSet.has(key) ? 1.15 : 1;
      const yes = dist(lod, ix, iz) < LOD_SPLIT * f * TILE_SIZE * 2 ** lod;
      if (yes) nextSplit.add(key);
      return yes;
    };

    /** true, wenn der Bereich vollständig mit fertigen Kacheln abgedeckt werden kann */
    const covered = (lod: number, ix: number, iz: number): boolean => {
      if (dist(lod, ix, iz) > VIEW_DISTANCE) return true; // wird ohnehin nicht gezeichnet
      if (!split(lod, ix, iz)) return ready(lod, ix, iz);
      for (let k = 0; k < 4; k++) if (!covered(lod - 1, ix * 2 + (k & 1), iz * 2 + (k >> 1))) return false;
      return true;
    };
    const children = (lod: number, ix: number, iz: number) =>
      [0, 1, 2, 3].map((k) => [lod - 1, ix * 2 + (k & 1), iz * 2 + (k >> 1)] as const);
    /**
     * Teilen, sobald alle Kinder fertig abdeckbar sind; bis dahin die eigene Kachel zeigen
     * (falls fertig) und die Kinder anfordern. Ist auch die eigene nicht fertig: zeigen, was da ist.
     */
    const select = (lod: number, ix: number, iz: number): void => {
      if (dist(lod, ix, iz) > VIEW_DISTANCE) return;
      const kids = split(lod, ix, iz) ? children(lod, ix, iz) : null;
      if (kids && kids.every(([l, x, z]) => covered(l, x, z))) {
        for (const [l, x, z] of kids) select(l, x, z);
        return;
      }
      const c = this.cache.get(`${lod},${ix},${iz}`);
      if (c) {
        visible.add(c);
        if (kids) for (const [l, x, z] of kids) requestTree(l, x, z);
        return;
      }
      request(lod, ix, iz);
      if (kids) for (const [l, x, z] of kids) select(l, x, z);
    };
    const request = (lod: number, ix: number, iz: number) => {
      if (!ready(lod, ix, iz)) want.push({ lod, ix, iz, d: dist(lod, ix, iz) });
    };
    /** alle Kacheln anfordern, die für die Ziel-Aufteilung unter diesem Knoten nötig sind */
    const requestTree = (lod: number, ix: number, iz: number): void => {
      if (dist(lod, ix, iz) > VIEW_DISTANCE) return;
      if (split(lod, ix, iz)) for (const [l, x, z] of children(lod, ix, iz)) requestTree(l, x, z);
      else request(lod, ix, iz);
    };

    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) select(MAX_LOD, rx + dx, rz + dz);

    this.splitSet = nextSplit;

    // Bau-Warteschlange: grob vor fein, nah vor fern
    this.queue = [];
    this.queued.clear();
    for (const w of want) {
      const key = `${w.lod},${w.ix},${w.iz}`;
      if (this.queued.has(key)) continue;
      this.queued.add(key);
      this.queue.push(w);
    }
    this.queue.sort((a, b) => b.lod - a.lod || a.d - b.d);
    let built = 0;
    if (this.workers.length) {
      // an freie Worker verteilen (bereits laufende überspringen)
      for (const q of this.queue) {
        if (!this.idle.length) break;
        const key = `${q.lod},${q.ix},${q.iz}`;
        if (this.pending.has(key)) continue;
        this.pending.add(key);
        this.idle.pop()!.postMessage({ key, lod: q.lod, ix: q.ix, iz: q.iz } satisfies TileRequest);
        built++;
      }
    } else {
      const t0 = performance.now();
      while (this.queue.length && (built === 0 || performance.now() - t0 < this.budgetMs)) {
        const q = this.queue.shift()!;
        const key = `${q.lod},${q.ix},${q.iz}`;
        this.addChunk(key, q.lod, q.ix, q.iz, this.buildGeometry(q.lod, q.ix, q.iz));
        built++;
      }
    }

    // Sichtbarkeit: nur Änderungen in den Szenengraph (kein clear/add je Frame)
    for (const c of this.attached) if (!visible.has(c)) this.root.remove(c.mesh);
    for (const c of visible) {
      c.lastUsed = this.frame;
      if (!this.attached.has(c)) this.root.add(c.mesh);
    }
    this.attached = visible;
    // Aufräumen (Kacheln, die 300 Frames ungenutzt sind)
    for (const [key, c] of this.cache) {
      if (this.frame - c.lastUsed > 300) {
        c.mesh.geometry.dispose();
        this.cache.delete(key);
      }
    }
    this.stats = { visible: visible.size, cached: this.cache.size, built, queue: this.queue.length };
  }
}
