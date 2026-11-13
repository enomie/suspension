/** 1 Three.js / Rapier unit = 1 meter */
export const TERRAIN_SIZE_M = 100;
export const TERRAIN_SEGMENTS = 128;

export const TERRAIN_ROWS = TERRAIN_SEGMENTS;
export const TERRAIN_COLS = TERRAIN_SEGMENTS;

/** Rapier: scale.x / scale.z = full extent of the heightfield in meters. */
export const HEIGHTFIELD_SCALE = {
  x: TERRAIN_SIZE_M,
  y: 1,
  z: TERRAIN_SIZE_M,
} as const;

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

/** Gemeinsames Raster von Physik und nächster LOD-Stufe [m] (= 100 m / 128, Detail wie bisher) */
export const GRID_SPACING = 0.78125;
/** Segmente pro Kachel (Physik + jede LOD-Stufe) */
export const TILE_SEGMENTS = 64;
/** Kantenlänge LOD 0 / Physik-Kachel [m] = 64 · 0,78125 */
export const TILE_SIZE = TILE_SEGMENTS * GRID_SPACING;
/** gröbste LOD-Stufe (Kante = 50 m · 2^MAX_LOD) */
export const MAX_LOD = 8;
/** Kachel wird geteilt, wenn Kamera näher als SPLIT · Kante */
export const LOD_SPLIT = 0.7;
/** Kacheln jenseits dieser Entfernung (Nebel-Ende) werden nicht geladen [m] */
export const VIEW_DISTANCE = 9500;
/** Physik-Kacheln: (2r+1)² um das Fahrzeug */
export const PHYSICS_TILE_RADIUS = 1;
