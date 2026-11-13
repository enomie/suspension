/**
 * Floating Origin: Szene + Physik arbeiten LOKAL, absolut = lokal + ORIGIN.
 * Terrain-Höhen werden immer mit absoluten Koordinaten berechnet (Float64 in JS → präzise bis weit > 1000 km).
 */
export const ORIGIN = { x: 0, z: 0 };

/** Ab dieser lokalen Entfernung wird verschoben [m] */
export const ORIGIN_SHIFT_THRESHOLD = 1024;
/** Verschiebung immer im Raster einer Physik-Kachel (hält alle Kachelraster ganzzahlig) [m] */
export const ORIGIN_GRID = 64;

/** Wieviel muss verschoben werden, damit (x, z) lokal wieder nahe 0 liegt? null = nicht nötig. */
export function originShiftFor(localX: number, localZ: number): { dx: number; dz: number } | null {
  if (Math.abs(localX) < ORIGIN_SHIFT_THRESHOLD && Math.abs(localZ) < ORIGIN_SHIFT_THRESHOLD) return null;
  return {
    dx: Math.round(localX / ORIGIN_GRID) * ORIGIN_GRID,
    dz: Math.round(localZ / ORIGIN_GRID) * ORIGIN_GRID,
  };
}
