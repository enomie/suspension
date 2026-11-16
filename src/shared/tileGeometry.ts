import { terrain } from './terrain';
import { sampleGrid } from './terrainHeight';
import { CELL, MAX_LOD, TILE_SEGMENTS, TILE_SIZE, lodSplit } from './config';

/**
 * Pure tile math (no three.js) — runs in the tile worker and on the main thread (fallback/tests).
 * Positions relative to tile center. Also for CDLOD geomorphing: height AND normal of the
 * next coarser LOD level (exactly as the parent tile shows it, including band limiting) plus the morph range.
 */
export const N = TILE_SEGMENTS;
export const VERTS = (N + 1) * (N + 1);
export const SKIRT_VERTS = 4 * (N + 1);
export const TILE_VERTS = VERTS + SKIRT_VERTS;

/** Edge ring (along all four edges) — source of skirt vertices */
export const RING: number[] = (() => {
  const v = (i: number, j: number) => j * (N + 1) + i;
  const r: number[] = [];
  for (let i = 0; i <= N; i++) r.push(v(i, 0));
  for (let i = 0; i <= N; i++) r.push(v(N, i));
  for (let i = N; i >= 0; i--) r.push(v(i, N));
  for (let i = N; i >= 0; i--) r.push(v(0, i));
  return r;
})();

/** Index buffer — identical for every tile */
export function buildTileIndex(): Uint32Array {
  const idx: number[] = [];
  const v = (i: number, j: number) => j * (N + 1) + i; // i along X, j along Z
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      // Diagonal (x1,z0)–(x0,z1) matches Rapier heightfield (verified by test), CCW from above
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

/** Tile edge per LOD level (table: this is called many times per frame) */
const TILE_SIZES = Array.from({ length: MAX_LOD + 1 }, (_, k) => TILE_SIZE * 2 ** k);
export const tileSize = (lod: number) => TILE_SIZES[lod] ?? TILE_SIZE * 2 ** lod;

/**
 * Morph range [start, end] (vertex–camera distance): at `end` the tile looks exactly like its parent.
 * end = parent's split distance → on split the children are fully morphed (= parent shape),
 * on merge (hysteresis ≥ end) likewise → no visible pop.
 */
export function morphRange(lod: number): [number, number] {
  if (lod >= MAX_LOD) return [1e9, 2e9];
  const end = lodSplit(lod + 1) * tileSize(lod + 1);
  return [end * 0.65, end];
}

export interface TileArrays {
  position: Float32Array;
  normal: Float32Array;
  /** Coarser LOD height minus this level's height */
  morph: Float32Array;
  /** Normal of the coarser LOD level */
  morphNormal: Float32Array;
  /** Road coverage 0…1 per vertex (render only: colours the road) */
  road: Float32Array;
  /** [start, end] per vertex (constant per tile) */
  morphRange: Float32Array;
  /** [min, max] tile height incl. morph target (for 3D LOD distance) */
  bounds: Float32Array;
}

export function buildTileArrays(lod: number, ix: number, iz: number): TileArrays {
  const size = tileSize(lod);
  const d = CELL * 2 ** lod;
  const x0 = ix * size;
  const z0 = iz * size;
  // this LOD level (band-limited to ≥ 2d), 1-point border for normals
  const W = N + 3;
  const h = sampleGrid(x0, z0, d, N, 1);
  const H = (i: number, j: number) => h[(j + 1) * W + (i + 1)];
  // coarser level = exactly what the parent tile shows (spacing 2d, band-limited to ≥ 4d), 1-point border
  const M = N / 2;
  const CW = M + 3;
  const hc = sampleGrid(x0, z0, 2 * d, M, 1);
  const C = (i: number, j: number) => hc[(j + 1) * CW + (i + 1)];

  const pos = new Float32Array(TILE_VERTS * 3);
  const nor = new Float32Array(TILE_VERTS * 3);
  const morph = new Float32Array(TILE_VERTS);
  const mnor = new Float32Array(TILE_VERTS * 3);
  const range = new Float32Array(TILE_VERTS * 2);
  const road = new Float32Array(TILE_VERTS);
  road.set(terrain().sampleMask('roadVis', x0, z0, d, N));
  const half = size / 2;

  const setN = (out: Float32Array, k: number, nx: number, ny: number, nz: number) => {
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    out[k * 3] = nx / l;
    out[k * 3 + 1] = ny / l;
    out[k * 3 + 2] = nz / l;
  };
  // coarse normal at coarse grid point (ci, cj): central differences on the coarse grid
  const coarseN = (ci: number, cj: number): number[] => [C(ci - 1, cj) - C(ci + 1, cj), 4 * d, C(ci, cj - 1) - C(ci, cj + 1)];
  const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      pos[k * 3] = i * d - half;
      pos[k * 3 + 1] = H(i, j);
      pos[k * 3 + 2] = j * d - half;
      setN(nor, k, H(i - 1, j) - H(i + 1, j), 2 * d, H(i, j - 1) - H(i, j + 1));

      // coarser level at this vertex: coarse grid points; in between, linear along edge or diagonal (x1,z0)–(x0,z1)
      const ci = i >> 1;
      const cj = j >> 1;
      const oi = i & 1;
      const oj = j & 1;
      let coarse: number;
      let cn: number[];
      if (!oi && !oj) {
        coarse = C(ci, cj);
        cn = coarseN(ci, cj);
      } else if (oi && !oj) {
        coarse = (C(ci, cj) + C(ci + 1, cj)) / 2;
        cn = add(coarseN(ci, cj), coarseN(ci + 1, cj));
      } else if (!oi && oj) {
        coarse = (C(ci, cj) + C(ci, cj + 1)) / 2;
        cn = add(coarseN(ci, cj), coarseN(ci, cj + 1));
      } else {
        coarse = (C(ci + 1, cj) + C(ci, cj + 1)) / 2;
        cn = add(coarseN(ci + 1, cj), coarseN(ci, cj + 1));
      }
      morph[k] = coarse - H(i, j);
      setN(mnor, k, cn[0], cn[1], cn[2]);
    }
  }

  // height span + largest morph offset → skirt depth covers cracks on steep slopes too
  let minY = Infinity;
  let maxY = -Infinity;
  let maxMorph = 0;
  for (let k = 0; k < VERTS; k++) {
    const y = pos[k * 3 + 1];
    const m = morph[k];
    minY = Math.min(minY, y, y + m);
    maxY = Math.max(maxY, y, y + m);
    maxMorph = Math.max(maxMorph, m < 0 ? -m : m);
  }
  const skirt = d * 2 + 0.5 * 2 ** lod + 2 * maxMorph;
  RING.forEach((src, r) => {
    const k = VERTS + r;
    pos[k * 3] = pos[src * 3];
    pos[k * 3 + 1] = pos[src * 3 + 1] - skirt;
    pos[k * 3 + 2] = pos[src * 3 + 2];
    nor.copyWithin(k * 3, src * 3, src * 3 + 3);
    mnor.copyWithin(k * 3, src * 3, src * 3 + 3);
    morph[k] = morph[src];
    road[k] = road[src];
  });
  const [r0, r1] = morphRange(lod);
  for (let k = 0; k < TILE_VERTS; k++) {
    range[k * 2] = r0;
    range[k * 2 + 1] = r1;
  }
  return {
    position: pos,
    normal: nor,
    morph,
    morphNormal: mnor,
    morphRange: range,
    road,
    bounds: new Float32Array([minY - skirt, maxY]),
  };
}
