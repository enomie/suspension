/**
 * public entry of the terrain generator (pure, no three.js/Rapier).
 * each thread sets the same config at start: `setTerrain(config)`.
 */
import { createTerrain, type Terrain } from './generator';
import { DEFAULT_TERRAIN } from './presets';
import type { TerrainConfig } from './types';

export { createTerrain, type Terrain } from './generator';
export { DEFAULT_TERRAIN, HILLS_TERRAIN, TERRAIN_PRESETS, WORLD_TERRAIN } from './presets';
export type { TerrainConfig, LayerConfig, Layer, SampleContext } from './types';

let active: Terrain = createTerrain(DEFAULT_TERRAIN);

/** active terrain of this thread */
export const terrain = (): Terrain => active;

/** set terrain for this thread (main thread, physics worker, each tile worker — same config) */
export function setTerrain(config: TerrainConfig): Terrain {
  active = createTerrain(config);
  return active;
}
