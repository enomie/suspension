import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { Corner, JointVisual, Vec3, VehicleSpec } from './types';
import type { BuildContext } from './parts/context';
import { createChassis } from './parts/chassis';
import { frameHalfLength } from '../../shared/vehicleSpec';
import { SUSPENSIONS } from './parts/suspension';
import { axleLoadShares } from './tuning';

export interface BuiltVehicle {
  chassis: RAPIER.RigidBody;
  corners: Corner[];
  joints: JointVisual[];
  /** Chassis-local mount points of chassis-side joints */
  mounts: Vec3[];
  names: Map<number, string>;
}

/** VehicleSpec → Rapier bodies + joints (no visuals). `pos` = world position of chassis origin. */
export function buildVehicle(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: VehicleSpec,
  pos: { x: number; y: number; z: number },
): BuiltVehicle {
  const chassis = createChassis(R, world, spec.chassis, pos, frameHalfLength(spec));
  const names = new Map<number, string>([[chassis.handle, `${spec.name}.chassis`]]);

  const comZ = spec.chassis.comOffset?.[2] ?? 0;
  const shares = axleLoadShares(spec.axles.map((a) => a.z), comZ);
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
  spec.axles.forEach((axle, i) => corners.push(...SUSPENSIONS[axle.suspension](ctx, axle, i)));
  return { chassis, corners, joints: ctx.joints, mounts: ctx.mounts, names };
}
