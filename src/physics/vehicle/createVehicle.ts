import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { AnyVehicleSpec } from '../../shared/anyVehicleSpec';
import { isTrackedSpec } from '../../shared/trackedSpec';
import { isBikeSpec } from '../../shared/bikeSpec';
import type { SimVehicle } from './simVehicle';
import { Vehicle } from './Vehicle';
import { TrackedVehicle } from './tracked/TrackedVehicle';
import { BikeVehicle } from './bike/BikeVehicle';

/** Wheeled, tracked or bike vehicle, depending on the spec's type */
export function createVehicle(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: AnyVehicleSpec,
  pos: { x: number; y: number; z: number },
): SimVehicle {
  if (isTrackedSpec(spec)) return new TrackedVehicle(R, world, spec, pos);
  if (isBikeSpec(spec)) return new BikeVehicle(R, world, spec, pos);
  return new Vehicle(R, world, spec, pos);
}
