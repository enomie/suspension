import type { TerrainConfig } from './types';

/** Standard: sanfte Hügel 1,5 … 7,5 m (Gradient-Noise; Wellenlänge/Gain so, dass alle Aufhängungen sauber fahren) */
export const DEFAULT_TERRAIN: TerrainConfig = {
  seed: 421337,
  layers: [{ type: 'detail', base: 1.5, amplitude: 6, wavelength: 50, octaves: 5, gain: 0.4 }],
};

export const TERRAIN_PRESETS: Record<string, TerrainConfig> = {
  default: DEFAULT_TERRAIN,
};
