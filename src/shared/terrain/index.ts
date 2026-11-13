/**
 * Öffentlicher Einstieg des Terrain-Generators (rein, ohne three.js/Rapier).
 * Jeder Thread setzt beim Start dieselbe Konfiguration: `setTerrain(config)`.
 */
import { createTerrain, type Terrain } from './generator';
import { DEFAULT_TERRAIN } from './presets';
import type { TerrainConfig } from './types';

export { createTerrain, type Terrain } from './generator';
export { DEFAULT_TERRAIN, TERRAIN_PRESETS } from './presets';
export type { TerrainConfig, LayerConfig, Layer, SampleContext } from './types';

let active: Terrain = createTerrain(DEFAULT_TERRAIN);

/** aktives Terrain dieses Threads */
export const terrain = (): Terrain => active;

/** Terrain dieses Threads setzen (Haupt-Thread, Physik-Worker und jeder Kachel-Worker mit derselben Konfiguration) */
export function setTerrain(config: TerrainConfig): Terrain {
  active = createTerrain(config);
  return active;
}
