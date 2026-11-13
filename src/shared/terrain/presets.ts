import type { TerrainConfig } from './types';

/** Nur Hügel 1,5 … 7,5 m (flache Testwelt; Fahrwerks-Tests laufen darauf) */
export const HILLS_TERRAIN: TerrainConfig = {
  seed: 421337,
  layers: [{ type: 'detail', base: 1.5, amplitude: 6, wavelength: 50, octaves: 5, gain: 0.4 }],
};

/**
 * Welt: Meer bis −1500 m (~40 %), Land (~60 %) bis 300 m, einzelne Gebirgszüge bis ~3000 m, Bodenwellen ±3 m.
 * Sea Level = y 0 (Wasser wird hier nicht gerendert).
 */
export const WORLD_TERRAIN: TerrainConfig = {
  seed: 421337,
  limits: { min: -1500, max: 3000, knee: 300 },
  layers: [
    {
      type: 'continent',
      wavelength: 160_000,
      octaves: 6,
      seaThreshold: -0.0604,
      landHeight: 300,
      shelfDepth: -150,
      maxDepth: -1500,
    },
    {
      type: 'mountains',
      maxHeight: 3000,
      rangeWavelength: 90_000,
      rangeThreshold: 0.12,
      ridgeWavelength: 9_000,
      ridgeOctaves: 9,
      stretch: 2.5,
      warp: 6_000,
    },
    { type: 'detail', base: -3, amplitude: 6, wavelength: 50, octaves: 5, gain: 0.4 },
  ],
};

export const DEFAULT_TERRAIN = WORLD_TERRAIN;

export const TERRAIN_PRESETS: Record<string, TerrainConfig> = {
  world: WORLD_TERRAIN,
  hills: HILLS_TERRAIN,
  default: DEFAULT_TERRAIN,
};
