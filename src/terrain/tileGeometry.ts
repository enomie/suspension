import { sampleTerrainHeightWorld } from './generateHeights';
import { TILE_SEGMENTS, TILE_SIZE } from './terrainConfig';

/**
 * Reine Kachel-Berechnung (ohne three.js) – läuft im Worker und im Main-Thread (Fallback/Tests).
 * Positionen relativ zur Kachelmitte, Normalen aus Höhenraster mit 1 Vertex Rand.
 */
export const N = TILE_SEGMENTS;
export const VERTS = (N + 1) * (N + 1);
export const SKIRT_VERTS = 4 * (N + 1);

/** Randring (entlang der 4 Kanten) – Quelle der Skirt-Vertices */
export const RING: number[] = (() => {
  const v = (i: number, j: number) => j * (N + 1) + i;
  const r: number[] = [];
  for (let i = 0; i <= N; i++) r.push(v(i, 0));
  for (let i = 0; i <= N; i++) r.push(v(N, i));
  for (let i = N; i >= 0; i--) r.push(v(i, N));
  for (let i = N; i >= 0; i--) r.push(v(0, i));
  return r;
})();

/** Indexpuffer – für alle Kacheln gleich */
export function buildTileIndex(): Uint32Array {
  const idx: number[] = [];
  const v = (i: number, j: number) => j * (N + 1) + i; // i entlang X, j entlang Z
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      // Diagonale (x1,z0)–(x0,z1) wie Rapier-Heightfield (per Test geprüft), CCW von oben
      idx.push(a, d, b, b, d, c);
    }
  }
  for (let k = 0; k < RING.length - 1; k++) {
    const s0 = VERTS + k;
    const s1 = VERTS + k + 1;
    idx.push(RING[k], RING[k + 1], s1, RING[k], s1, s0);
  }
  return new Uint32Array(idx);
}

export interface TileArrays {
  position: Float32Array;
  normal: Float32Array;
}

export function buildTileArrays(lod: number, ix: number, iz: number): TileArrays {
  const size = TILE_SIZE * 2 ** lod;
  const d = size / N;
  const x0 = ix * size;
  const z0 = iz * size;
  const W = N + 3;
  const h = new Float64Array(W * W);
  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) h[j * W + i] = sampleTerrainHeightWorld(x0 + (i - 1) * d, z0 + (j - 1) * d);

  const pos = new Float32Array((VERTS + SKIRT_VERTS) * 3);
  const nor = new Float32Array((VERTS + SKIRT_VERTS) * 3);
  const half = size / 2;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      const c = (j + 1) * W + (i + 1);
      pos[k * 3] = i * d - half;
      pos[k * 3 + 1] = h[c];
      pos[k * 3 + 2] = j * d - half;
      const nx = h[c - 1] - h[c + 1];
      const nz = h[c - W] - h[c + W];
      const ny = 2 * d;
      const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l;
      nor[k * 3 + 1] = ny / l;
      nor[k * 3 + 2] = nz / l;
    }
  }
  const skirt = d * 2 + 0.5 * 2 ** lod;
  RING.forEach((src, r) => {
    const k = VERTS + r;
    pos[k * 3] = pos[src * 3];
    pos[k * 3 + 1] = pos[src * 3 + 1] - skirt;
    pos[k * 3 + 2] = pos[src * 3 + 2];
    nor.copyWithin(k * 3, src * 3, src * 3 + 3);
  });
  return { position: pos, normal: nor };
}
