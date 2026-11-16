import type { DriverInput, VehicleSpec } from './vehicleSpec';
import type { VehicleLayout } from './vehicleLayout';
import type { TerrainConfig } from './terrain/types';

/** main thread → physics worker */
export type ToWorker =
  | { type: 'init'; preset: number; x: number; z: number; terrain: TerrainConfig }
  | { type: 'input'; input: DriverInput }
  /** `spec` = custom vehicle (then `preset` is -1) */
  | { type: 'spawn'; preset: number; spec?: VehicleSpec };

/** physics worker → main thread */
export type FromWorker =
  /** new vehicle (start, respawn, preset): layout for rendering */
  | { type: 'vehicle'; gen: number; preset: number; layout: VehicleLayout }
  /** all snapshots since last message (usually 1, several after delay) */
  | { type: 'snapshots'; list: Float64Array[]; stepMs: number };
