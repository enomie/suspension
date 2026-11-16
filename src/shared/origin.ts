/**
 * floating origin: scene + physics work LOCAL, absolute = local + ORIGIN.
 * terrain heights always computed in absolute coordinates (Float64 in JS → precise well beyond 1000 km).
 */
export const ORIGIN = { x: 0, z: 0 };

/** shift when local distance exceeds this [m] */
export const ORIGIN_SHIFT_THRESHOLD = 1024;
/** shift always on physics-tile grid (keeps all tile grids aligned) [m] */
export const ORIGIN_GRID = 64;

/** how much to shift so (x, z) is local near 0 again? null = not needed. */
export function originShiftFor(localX: number, localZ: number): { dx: number; dz: number } | null {
  if (Math.abs(localX) < ORIGIN_SHIFT_THRESHOLD && Math.abs(localZ) < ORIGIN_SHIFT_THRESHOLD) return null;
  return {
    dx: Math.round(localX / ORIGIN_GRID) * ORIGIN_GRID,
    dz: Math.round(localZ / ORIGIN_GRID) * ORIGIN_GRID,
  };
}
