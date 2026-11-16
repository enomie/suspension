/**
 * terrain generator: types. Pure data and pure functions here (no three.js, no Rapier),
 * so the same config yields the same ground in every thread and other projects.
 */
import type { CalmLayerConfig } from './layers/calm';
import type { ContinentLayerConfig } from './layers/continent';
import type { DetailLayerConfig } from './layers/detail';
import type { MountainLayerConfig } from './layers/mountains';
import type { RoadsLayerConfig } from './layers/roads';
import type { TestHillsLayerConfig } from './layers/testHills';

/** layer configuration — plain data (transferable via postMessage) */
export type LayerConfig = ContinentLayerConfig | MountainLayerConfig | DetailLayerConfig | CalmLayerConfig | RoadsLayerConfig | TestHillsLayerConfig;

export interface TerrainConfig {
  /** base seed; each layer derives its own (name + seed) */
  seed: number;
  /** layers in evaluation order */
  layers: LayerConfig[];
  /** bounds [m]: soft max (asymptotic from max − knee), hard min */
  limits?: { min: number; max: number; knee: number };
}

/**
 * state of a sample point that layers process in sequence.
 * Later layers read masks from earlier ones (e.g. `land`, `mountain`).
 */
export interface SampleContext {
  /** absolute Position [m] */
  x: number;
  z: number;
  /** height [m] above sea level (y = 0) */
  height: number;
  /** masks 0…1 from earlier layers */
  masks: Record<string, number>;
  /** omit wavelengths below this (coarse LOD levels); 0 = full resolution (physics) */
  minWavelength: number;
}

/** one layer: modifies ctx.height (and masks if needed). Must be deterministic. */
export interface Layer {
  readonly name: string;
  /** Names of the masks this layer writes (lets `sampleMask` stop early) */
  readonly provides?: readonly string[];
  apply(ctx: SampleContext): void;
}
