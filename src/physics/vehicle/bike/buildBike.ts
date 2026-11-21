import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { bikeVehicleSpec, validateBikeSpec, type BikeVehicleSpec } from '../../../shared/bikeSpec';
import { buildVehicle, type BuiltVehicle } from '../buildVehicle';

export type BuiltBike = BuiltVehicle;

/**
 * BikeVehicleSpec → Rapier bodies + joints (no visuals). Fork, swingarm and torus wheels come from the regular
 * builders (`telescopicFork`, `swingArm`); `bikeVehicleSpec()` derives their geometry from the bike spec.
 * @param pos world position of the chassis origin (middle of the wheelbase)
 * @throws if the spec is invalid (see `validateBikeSpec`)
 */
export function buildBikeVehicle(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: BikeVehicleSpec,
  pos: { x: number; y: number; z: number },
): BuiltBike {
  const errors = validateBikeSpec(spec);
  if (errors.length) throw new Error(`bike '${spec.name}': ${errors.join('; ')}`);
  return buildVehicle(R, world, bikeVehicleSpec(spec), pos);
}
