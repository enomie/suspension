import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { DriverInput } from '../../shared/driverInput';
import type { Corner } from './types';
import type { BuiltVehicle } from './buildVehicle';

/** What the simulation needs from a vehicle, wheeled or tracked */
export interface SimVehicle {
  readonly built: BuiltVehicle;
  readonly chassis: RAPIER.RigidBody;
  readonly corners: Corner[];
  /** forward speed [m/s] (+ = chassis −Z) */
  readonly forwardSpeed: number;
  /** call before every world.step() */
  applyInput(input: DriverInput, dt: number): void;
  /** call after world.step() */
  updateTelemetry(): void;
  dispose(): void;
}
