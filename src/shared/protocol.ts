import type { DriverInput } from './vehicleSpec';
import type { VehicleLayout } from './vehicleLayout';
import type { TerrainConfig } from './terrain/types';

/** Haupt-Thread → Physik-Worker */
export type ToWorker =
  | { type: 'init'; preset: number; x: number; z: number; terrain: TerrainConfig }
  | { type: 'input'; input: DriverInput }
  | { type: 'spawn'; preset: number };

/** Physik-Worker → Haupt-Thread */
export type FromWorker =
  /** neues Fahrzeug (Start, Respawn, Preset): Layout für die Optik */
  | { type: 'vehicle'; gen: number; preset: number; layout: VehicleLayout }
  /** alle Snapshots seit der letzten Nachricht (meist 1, nach Verzögerung mehrere) */
  | { type: 'snapshots'; list: Float64Array[]; stepMs: number };
