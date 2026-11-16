/** shared constants (physics + rendering). 1 unit = 1 meter. terrain shape: src/shared/terrain/. */

/*
 * terrain grid: all powers of two so each LOD level hits exactly every other sample of the finer one
 * (same samples → same heights; coarse level = fine level without odd-index samples).
 *
 *   level k:  cell CELL·2^k,  tile edge TILE_SIZE·2^k
 *   k = 0:    0.5 m,   32 m        (near render = physics grid)
 *   k = 6:    32 m,    2048 m      (end of detail range)
 *   k = 10:   512 m,   32 768 m    (root, view distance)
 */

/** finest grid [m] — physics and LOD 0 */
export const CELL = 0.5;
/** segments per render tile (each LOD level) */
export const TILE_SEGMENTS = 64;
/** edge length of LOD-0 render tile [m] = 64 · 0.5 */
export const TILE_SIZE = TILE_SEGMENTS * CELL;
/** coarsest LOD level: edge 32 m · 2^10 = 32 768 m */
export const MAX_LOD = 10;
/** view distance = fog end [m] (2^15) */
export const VIEW_DISTANCE = 32768;
/** fine resolution up to here (quadtree with dense splits) [m] (2^11) */
export const DETAIL_RANGE = 2048;

/**
 * tile at level `lod` splits when camera is closer than lodSplit(lod) · edge.
 * levels with edge ≤ DETAIL_RANGE/2 split tightly (0.9) → fine to ~2 km; above coarse (0.5) → few tiles.
 */
export function lodSplit(lod: number): number {
  return TILE_SIZE * 2 ** lod <= DETAIL_RANGE / 2 ? 0.9 : 0.5;
}

/** physics tile: 128 cells at 0.5 m = 64 m (= 2×2 LOD-0 render tiles, same samples) */
export const PHYSICS_TILE_SEGMENTS = 128;
export const PHYSICS_TILE_SIZE = PHYSICS_TILE_SEGMENTS * CELL;
/** physics tiles: (2r+1)² around the vehicle */
export const PHYSICS_TILE_RADIUS = 1;
