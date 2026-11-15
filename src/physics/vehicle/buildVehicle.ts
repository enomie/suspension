import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { Corner, JointVisual, VehicleSpec } from './types';
import type { BuildContext } from './parts/context';
import { createChassis } from './parts/chassis';
import { SUSPENSIONS } from './parts/suspension';
import { axleLoadShares } from './tuning';

export interface BuiltVehicle {
  chassis: RAPIER.RigidBody;
  corners: Corner[];
  joints: JointVisual[];
  names: Map<number, string>;
}

/** VehicleSpec → Rapier-Körper + Joints (keine Optik). `pos` = Welt-Position des Chassis-Ursprungs. */
export function buildVehicle(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: VehicleSpec,
  pos: { x: number; y: number; z: number },
): BuiltVehicle {
  const chassis = createChassis(R, world, spec.chassis, pos);
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
    names,
  };

  const corners: Corner[] = [];
  spec.axles.forEach((axle, i) => corners.push(...SUSPENSIONS[axle.suspension](ctx, axle, i)));
  return { chassis, corners, joints: ctx.joints, names };
}
