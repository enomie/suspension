import type { DriverInput } from '../vehicle/types';

/** Haupt-Thread → Physik-Worker */
export type ToWorker =
  | { type: 'init'; preset: number; x: number; z: number }
  | { type: 'input'; input: DriverInput }
  | { type: 'spawn'; preset: number };

/** Physik-Worker → Haupt-Thread */
export type FromWorker =
  | { type: 'ready'; gen: number; preset: number }
  | { type: 'spawned'; gen: number; preset: number }
  /** alle Snapshots seit der letzten Nachricht (meist 1, nach Verzögerung mehrere) */
  | { type: 'snapshots'; list: Float64Array[]; stepMs: number };
