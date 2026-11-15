import type { TerrainConfig } from './types';

/** Nur Hügel 1,5 … 7,5 m (flache Testwelt; Fahrwerks-Tests laufen darauf) */
export const HILLS_TERRAIN: TerrainConfig = {
  seed: 421337,
  layers: [{ type: 'detail', base: 1.5, amplitude: 6, wavelength: 50, octaves: 5, gain: 0.4 }],
};

/**
 * World: flat land at y ≈ 10 (bumps ±3 m), frequent mountain ranges up to 500 m, Voronoi roads (10 m wide,
 * bumps ±0.5 m) and a calm spawn area around (0, 0) (bumps ±0.5 m, no mountains). No sea.
 */
export const WORLD_TERRAIN: TerrainConfig = {
  seed: 421337,
  limits: { min: -50, max: 500, knee: 60 },
  layers: [
    { type: 'calm', x: 0, z: 0, radius: 400, falloff: 1200 },
    {
      type: 'mountains',
      maxHeight: 480,
      rangeWavelength: 30_000,
      rangeThreshold: -0.05,
      rangeFalloff: 0.3,
      massWavelength: 8_000,
      ridgeWavelength: 4_000,
      ridgeOctaves: 5,
      detailOctaves: 3,
      fineAmount: 0.01,
      crestRound: 0.12,
      stretch: 1.3,
      warp: 500,
    },
    { type: 'roads', cellSize: 400, width: 10, blend: 6 },
    { type: 'detail', base: 7, amplitude: 6, wavelength: 50, octaves: 5, gain: 0.4, calmAmplitude: 1 },
  ],
};

export const DEFAULT_TERRAIN = WORLD_TERRAIN;

export const TERRAIN_PRESETS: Record<string, TerrainConfig> = {
  world: WORLD_TERRAIN,
  hills: HILLS_TERRAIN,
  default: DEFAULT_TERRAIN,
};
