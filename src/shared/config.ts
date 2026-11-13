/** Gemeinsame Konstanten (Physik + Optik). 1 Einheit = 1 Meter. */

export const TERRAIN_NOISE = {
  seed: 421337,
  baseFrequency: 0.035,
  octaves: 5,
  persistence: 0.45,
  lacunarity: 2.1,
  /** Max vertical variation in meters — detailed hills, not mountains */
  amplitudeM: 6,
  baseElevationM: 1.5,
} as const;

/*
 * Terrain-Raster: alles Zweierpotenzen, damit jede Stufe exakt jeden zweiten Punkt der feineren trifft
 * (gleiche Abtastpunkte → gleiche Höhen; grobe Stufe = feine Stufe ohne die ungeraden Punkte).
 *
 *   Stufe k:  Zellweite CELL·2^k,  Kachelkante TILE_SIZE·2^k
 *   k = 0:    0,5 m,   32 m        (Optik nah = Physik-Raster)
 *   k = 6:    32 m,    2048 m      (Ende des Detailbereichs)
 *   k = 10:   512 m,   32 768 m    (Wurzel, Sichtweite)
 */

/** Feinstes Raster [m] – Physik und LOD 0 */
export const CELL = 0.5;
/** Segmente pro Render-Kachel (jede LOD-Stufe) */
export const TILE_SEGMENTS = 64;
/** Kantenlänge einer LOD-0-Render-Kachel [m] = 64 · 0,5 */
export const TILE_SIZE = TILE_SEGMENTS * CELL;
/** gröbste LOD-Stufe: Kante 32 m · 2^10 = 32 768 m */
export const MAX_LOD = 10;
/** Sichtweite = Nebel-Ende [m] (2^15) */
export const VIEW_DISTANCE = 32768;
/** Bis hierher fein aufgelöst (Quadtree mit dichter Teilung) [m] (2^11) */
export const DETAIL_RANGE = 2048;

/**
 * Kachel der Stufe `lod` wird geteilt, wenn die Kamera näher als lodSplit(lod) · Kante ist.
 * Stufen bis Kante DETAIL_RANGE/2 teilen dicht (0,9) → fein bis ~2 km; darüber grob (0,5) → wenige Kacheln.
 */
export function lodSplit(lod: number): number {
  return TILE_SIZE * 2 ** lod <= DETAIL_RANGE / 2 ? 0.9 : 0.5;
}

/** Physik-Kachel: 128 Zellen à 0,5 m = 64 m (= 2×2 LOD-0-Render-Kacheln, gleiche Punkte) */
export const PHYSICS_TILE_SEGMENTS = 128;
export const PHYSICS_TILE_SIZE = PHYSICS_TILE_SEGMENTS * CELL;
/** Physik-Kacheln: (2r+1)² um das Fahrzeug */
export const PHYSICS_TILE_RADIUS = 1;
