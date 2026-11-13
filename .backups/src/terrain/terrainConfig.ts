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
