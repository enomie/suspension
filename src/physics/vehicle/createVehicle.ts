import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { VehicleSpec } from './types';
import { isTrackedSpec, type TrackedVehicleSpec } from '../../shared/trackedSpec';
import type { SimVehicle } from './simVehicle';
import { Vehicle } from './Vehicle';
import { TrackedVehicle } from './tracked/TrackedVehicle';

/** Wheeled or tracked vehicle, depending on the spec's type */
export function createVehicle(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: VehicleSpec | TrackedVehicleSpec,
  pos: { x: number; y: number; z: number },
): SimVehicle {
  return isTrackedSpec(spec) ? new TrackedVehicle(R, world, spec, pos) : new Vehicle(R, world, spec, pos);
}
