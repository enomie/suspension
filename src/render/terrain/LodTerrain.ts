import { BatchedMesh, BufferAttribute, BufferGeometry, Matrix4, type Camera, type Material, type PerspectiveCamera } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  distance,
  mix,
  modelWorldMatrix,
  normalLocal,
  positionLocal,
  smoothstep,
  transformNormalToView,
  uniform,
  varying,
  vec3,
  vec4,
} from 'three/tsl';
import { ORIGIN } from '../../shared/origin';
import { sampleTerrainHeightWorld } from '../../shared/terrainHeight';
import { buildTileArrays, buildTileIndex, TILE_VERTS, tileSize, type TileArrays } from '../../shared/tileGeometry';
import type { TileRequest, TileWorkerMessage } from './tileWorker';
import { terrain } from '../../shared/terrain';
import { MAX_LOD, VIEW_DISTANCE, lodSplit } from '../../shared/config';

/** Debug: Geomorphing an (1) / aus (0) */
export const morphEnabled = uniform(1);

/** Kachel-Plätze im BatchedMesh (sichtbar ~150, Rest = Cache) */
const SLOTS = 320;
const INDEX = buildTileIndex();

/**
 * Ein Material für alle Kacheln. CDLOD-Geomorphing im Vertex-Shader: zwischen morphRange.x und .y
 * (Abstand Vertex–Kamera) gleiten Höhe UND Normale zur nächstgröberen Stufe → weder Geometrie- noch
 * Licht-Sprung beim Kachelwechsel.
 */
function terrainMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: 0x4a6741, roughness: 0.92, metalness: 0.02 });
  const range = attribute('morphRange', 'vec2');
  // positionLocal enthält hier bereits die Kachel-Position (BatchedMesh)
  const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const k = varying(smoothstep(range.x, range.y, distance(wp, cameraPosition)).mul(morphEnabled));
  m.positionNode = positionLocal.add(vec3(0, attribute('morph', 'float').mul(k), 0));
  m.normalNode = transformNormalToView(mix(normalLocal, attribute('morphNormal', 'vec3'), k)).normalize();
  return m;
}

interface Chunk {
  key: string;
  lod: number;
  ix: number;
  iz: number;
  /** Platz im BatchedMesh (Geometrie- = Instanz-Index) */
  slot: number;
  /** Höhenspanne [min, max] (absolut = lokal, y wird nicht verschoben) */
  minY: number;
  maxY: number;
  lastUsed: number;
}

/**
 * Unendliches LOD-Terrain: Quadtree aus Kacheln mit je 64×64 Segmenten, Kanten 32 m · 2^k.
 * LOD 0 = 0,5-m-Raster = Physik-Raster (gleiche Punkte, gleiche Diagonale). Fein bis ~2 km
 * (`lodSplit`), dahinter grob bis 32 km. ALLE Kacheln liegen in EINEM BatchedMesh → 1 Draw Call.
 * Kacheln werden im Worker-Pool berechnet (grob zuerst, nah zuerst); ohne Worker synchron mit Zeitbudget.
 */
export class LodTerrain {
  readonly material = terrainMaterial();
  readonly mesh: BatchedMesh;
  /** Szenen-Wurzel (= das BatchedMesh) */
  get root(): BatchedMesh {
    return this.mesh;
  }
  private cache = new Map<string, Chunk>();
  private freeSlots: number[] = [];
  private queue: { lod: number; ix: number; iz: number; d: number }[] = [];
  private frame = 0;
  /** im letzten Durchlauf geteilte Knoten (für Hysterese) */
  private splitSet = new Set<string>();
  private inView = new Set<string>();
  /** Bau-Budget pro Frame [ms] (nur ohne Worker) */
  budgetMs = 3;
  stats = { visible: 0, cached: 0, built: 0, queue: 0, drawCalls: 1 };
  /** Debug: Auswahl einfrieren */
  frozen = false;

  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private pending = new Set<string>();
  private dirty = true;
  private lastCam = { x: NaN, y: NaN, z: NaN };
  private visible = new Set<Chunk>();
  private _m = new Matrix4();

  constructor(workerCount = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1))) {
    const idx = INDEX.length;
    this.mesh = new BatchedMesh(SLOTS, SLOTS * TILE_VERTS, SLOTS * idx, this.material);
    // receiveShadow + BatchedMesh + WebGPURenderer: Culling aus Shadow-Pass kann Hauptbild leeren (three.js #34822)
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false; // Gesamt-Hülle ändert sich laufend; pro Kachel wird gecullt
    this.mesh.perObjectFrustumCulled = false;
    this.mesh.sortObjects = false;
    // Plätze einmal reservieren (Neu-Hinzufügen würde Puffer-Speicher verbrauchen), dann nur überschreiben
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
      // gleiche Terrain-Konfiguration wie dieser Thread
      w.postMessage({ type: 'terrain', config: terrain().config } satisfies TileWorkerMessage);
      w.onmessage = (e: MessageEvent<TileRequest & TileArrays>) => {
        const { key, lod, ix, iz } = e.data;
        this.pending.delete(key);
        this.idle.push(w);
        this.addChunk(key, lod, ix, iz, e.data);
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
    g.setAttribute('morphNormal', new BufferAttribute(a.morphNormal, 3));
    g.setAttribute('morphRange', new BufferAttribute(a.morphRange, 2));
    g.setIndex(new BufferAttribute(INDEX, 1));
    return g;
  }

  /** Kachel als eigene Geometrie (Tests / Analyse) */
  buildGeometry(lod: number, ix: number, iz: number): BufferGeometry {
    return this.geometryFrom(buildTileArrays(lod, ix, iz));
  }

  /** Platz holen: frei, sonst die am längsten unbenutzte unsichtbare Kachel verdrängen */
  private takeSlot(): number | null {
    if (this.freeSlots.length) return this.freeSlots.pop()!;
    let oldest: Chunk | null = null;
    for (const c of this.cache.values())
      if (!this.visible.has(c) && (!oldest || c.lastUsed < oldest.lastUsed)) oldest = c;
    if (!oldest) return null;
    this.cache.delete(oldest.key);
    return oldest.slot;
  }

  private addChunk(key: string, lod: number, ix: number, iz: number, a: TileArrays): void {
    if (this.cache.has(key)) return;
    const slot = this.takeSlot();
    if (slot === null) return; // voll – kommt beim nächsten Durchlauf wieder
    const g = this.geometryFrom(a);
    this.mesh.setGeometryAt(slot, g);
    g.dispose();
    this.mesh.setVisibleAt(slot, false);
    const c: Chunk = { key, lod, ix, iz, slot, lastUsed: this.frame, minY: a.bounds[0], maxY: a.bounds[1] };
    this.place(c);
    this.cache.set(key, c);
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

  /** nach Floating-Origin-Shift alle Kacheln neu platzieren */
  onOriginShift(): void {
    for (const c of this.cache.values()) this.place(c);
    this.dirty = true;
  }

  /** Debug: Drahtgitter */
  set wireframe(on: boolean) {
    this.material.wireframe = on;
  }

  /** sichtbare Kacheln als "lod,ix,iz" (Tests / Debug) */
  visibleKeys(): string[] {
    return [...this.visible].map((c) => c.key).sort();
  }

  /**
   * WebGPURenderer-Fallback auf WebGL2: BatchedMesh aktualisiert Draw-Listen sonst nicht
   * (isWebGPURenderer bleibt true) → Terrain unsichtbar in Chrome ohne natives WebGPU.
   */
  beforeRender(renderer: WebGPURenderer, camera: PerspectiveCamera): void {
    const backend = renderer.backend as { isWebGPUBackend?: boolean };
    if (backend.isWebGPUBackend) return;
    type Draw = BatchedMesh & {
      _updateDrawParameters(camera: Camera, geometry: BufferGeometry, material: Material): void;
    };
    (this.mesh as Draw)._updateDrawParameters(camera, this.mesh.geometry, this.material);
  }

  /** Kamera (lokal) → Kacheln wählen, bauen, sichtbar schalten. */
  update(camX: number, camY: number, camZ: number): void {
    this.frame++;
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
    const key = (lod: number, ix: number, iz: number) => `${lod},${ix},${iz}`;
    const ready = (lod: number, ix: number, iz: number) => this.cache.has(key(lod, ix, iz));
    /**
     * Abstand Kamera ↔ Kachel in 3D: über die Höhenspanne der Kachel (Berg 2 km höher zählt mit).
     * Noch nicht gebaute Kachel: Kamerahöhe über dem Boden darunter als Näherung.
     */
    const dist = (lod: number, ix: number, iz: number) => {
      const s = tileSize(lod);
      const dx = Math.max(0, Math.abs(ax - (ix + 0.5) * s) - s / 2);
      const dz = Math.max(0, Math.abs(az - (iz + 0.5) * s) - s / 2);
      const c = this.cache.get(key(lod, ix, iz));
      const dy = c ? Math.max(0, c.minY - camY, camY - c.maxY) : camH;
      return Math.sqrt(dx * dx + dz * dz + dy * dy);
    };
    /** Sichtweiten-Grenze ebenfalls mit Hysterese (sonst Pendeln am Nebel-Ende) */
    const nextInView = new Set<string>();
    const outOfView = (lod: number, ix: number, iz: number) => {
      const k = key(lod, ix, iz);
      const out = dist(lod, ix, iz) > VIEW_DISTANCE * (this.inView.has(k) ? 1.05 : 1);
      if (!out) nextInView.add(k);
      return out;
    };
    /** Teilen mit Hysterese: einmal geteilt erst bei +15 % Abstand wieder zusammenfassen */
    const nextSplit = new Set<string>();
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
     * Verfeinern Ebene für Ebene: eine Kachel wird nur durch ihre 4 Kinder ersetzt, wenn diese 4 fertig sind.
     * Fehlt ein Kind, bleibt NUR diese Kachel stehen (nicht der ganze Teilbaum bis zur Wurzel) und die Kinder
     * werden angefordert. So fehlt beim Fahren höchstens kurz eine Stufe Detail – nichts springt großflächig.
     */
    const select = (lod: number, ix: number, iz: number): void => {
      if (outOfView(lod, ix, iz)) return;
      const c = this.cache.get(key(lod, ix, iz));
      if (!c) return request(lod, ix, iz); // Elternteil bleibt sichtbar (siehe unten)
      c.lastUsed = this.frame;
      if (split(lod, ix, iz)) {
        const kids = children(lod, ix, iz).filter(([l, x, z]) => !outOfView(l, x, z));
        const kidChunks = kids.map(([l, x, z]) => this.cache.get(key(l, x, z)));
        for (const k of kidChunks) if (k) k.lastUsed = this.frame; // gebraucht → nicht verdrängen
        if (kidChunks.every((k) => k)) {
          for (const [l, x, z] of kids) select(l, x, z);
          return;
        }
        for (const [l, x, z] of kids) request(l, x, z);
      }
      visible.add(c);
    };
    // alle Wurzel-Kacheln, die die Sichtweite berühren (kein festes 3×3-Fenster → kein Springen an Wurzelgrenzen)
    const R = VIEW_DISTANCE * 1.05;
    for (let z = Math.floor((az - R) / rootSize); z <= Math.floor((az + R) / rootSize); z++)
      for (let x = Math.floor((ax - R) / rootSize); x <= Math.floor((ax + R) / rootSize); x++)
        select(MAX_LOD, x, z);
    this.splitSet = nextSplit;
    this.inView = nextInView;

    // Sichtbarkeit nur bei Änderung umschalten (vor dem Bauen, damit sichtbare nicht verdrängt werden)
    for (const c of this.visible) if (!visible.has(c) && this.cache.get(c.key) === c) this.mesh.setVisibleAt(c.slot, false);
    for (const c of visible) {
      c.lastUsed = this.frame;
      if (!this.visible.has(c)) this.mesh.setVisibleAt(c.slot, true);
    }
    this.visible = visible;

    // Bau-Warteschlange: grob vor fein, nah vor fern
    const seen = new Set<string>();
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
        this.idle.pop()!.postMessage({ type: 'tile', key: k, lod: q.lod, ix: q.ix, iz: q.iz } satisfies TileRequest);
        built++;
      }
    } else {
      const t0 = performance.now();
      while (this.queue.length && (built === 0 || performance.now() - t0 < this.budgetMs)) {
        const q = this.queue.shift()!;
        this.addChunk(key(q.lod, q.ix, q.iz), q.lod, q.ix, q.iz, buildTileArrays(q.lod, q.ix, q.iz));
        built++;
      }
      if (built) this.dirty = true;
    }
    this.stats = { visible: visible.size, cached: this.cache.size, built, queue: this.queue.length, drawCalls: 1 };
  }
}
