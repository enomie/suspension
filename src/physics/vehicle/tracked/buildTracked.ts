import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { frameHalfLength, type AxleSpec } from '../../../shared/vehicleSpec';
import { validateTrackedSpec, type TrackedVehicleSpec } from '../../../shared/trackedSpec';
import type { BuiltVehicle } from '../buildVehicle';
import type { Corner } from '../types';
import type { BuildContext } from '../parts/context';
import { createChassis } from '../parts/chassis';
import { buildStrut } from '../parts/suspension/strut';
import { axleLoadShares } from '../tuning';

export type BuiltTracked = BuiltVehicle;

/**
 * Road axles as the wheeled builder sees them: the collider stands for the track, so it is as wide as the belt and
 * its radius includes the chain thickness. The drive then also works on the outer surface of the track.
 */
export function trackContactAxles(spec: TrackedVehicleSpec): AxleSpec[] {
  return spec.axles.map((a) => ({
    ...a,
    wheel: { ...a.wheel, shape: 'cylinder', radius: a.wheel.radius + spec.chainThickness, width: spec.beltWidth },
  }));
}

/**
 * TrackedVehicleSpec → Rapier bodies + joints (no visuals, no chain).
 * Road wheels hang on the sliding strut suspension, like the wheeled vehicle, with a track-wide collider.
 * Idler and sprocket have no collider: the chain contact (`trackContact.ts`) carries the track around them.
 * @param pos world position of the chassis origin
 * @throws if the spec is invalid (see `validateTrackedSpec`)
 */
export function buildTrackedVehicle(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: TrackedVehicleSpec,
  pos: { x: number; y: number; z: number },
): BuiltTracked {
  const errors = validateTrackedSpec(spec);
  if (errors.length) throw new Error(`tracked vehicle '${spec.name}': ${errors.join('; ')}`);

  // hull = the ladder frame over the road axles, as drawn; idler and sprocket have their own small colliders
  const chassis = createChassis(R, world, spec.chassis, pos, frameHalfLength(spec));
  const names = new Map<number, string>([[chassis.handle, `${spec.name}.chassis`]]);

  const axles = trackContactAxles(spec);
  const shares = axleLoadShares(axles.map((a) => a.z), spec.chassis.comOffset?.[2] ?? 0);
  const ctx: BuildContext = {
    R,
    world,
    name: spec.name,
    origin: pos,
    chassis,
    axleSprungMass: shares.map((s) => s * spec.chassis.mass),
    joints: [],
    mounts: [],
    names,
  };

  const corners: Corner[] = [];
  axles.forEach((axle, i) => corners.push(...buildStrut(ctx, axle, i)));

  return { chassis, corners, joints: ctx.joints, mounts: ctx.mounts, names };
}
