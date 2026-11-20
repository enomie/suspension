import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { AxleSpec } from '../../../shared/vehicleSpec';
import { validateTrackedSpec, type TrackEndWheelSpec, type TrackedVehicleSpec } from '../../../shared/trackedSpec';
import type { BuiltVehicle } from '../buildVehicle';
import type { Corner } from '../types';
import type { BuildContext } from '../parts/context';
import { createChassis } from '../parts/chassis';
import { buildStrut } from '../parts/suspension/strut';
import { CHASSIS_GROUPS } from '../groups';
import { axleLoadShares } from '../tuning';

/** Idler and sprocket colliders are this share of the rim radius: small, so they never catch on terrain */
export const END_COLLIDER_RADIUS_SHARE = 0.5;
/** edge radius of the idler and sprocket colliders [m] */
const END_COLLIDER_EDGE_RADIUS = 0.03;
/** extra length of the frame behind the outermost wheel centre [m] */
const FRAME_END_MARGIN = 0.04;

export interface BuiltTracked extends BuiltVehicle {
  /** idler and sprocket colliders (left and right of each), fixed to the chassis */
  endColliders: RAPIER.Collider[];
}

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

/** a small rounded cylinder (axis X) fixed on the chassis, no mass of its own */
function addEndCollider(
  R: typeof RAPIER,
  world: RAPIER.World,
  chassis: RAPIER.RigidBody,
  w: TrackEndWheelSpec,
  x: number,
): RAPIER.Collider {
  const radius = w.radius * END_COLLIDER_RADIUS_SHARE;
  const border = Math.min(END_COLLIDER_EDGE_RADIUS, w.width / 2, radius);
  const s = Math.SQRT1_2;
  const desc = R.ColliderDesc.roundCylinder(w.width / 2 - border, radius - border, border)
    .setRotation({ x: 0, y: 0, z: s, w: s })
    .setTranslation(x, w.y, w.z)
    .setDensity(0)
    .setFriction(0.5)
    .setCollisionGroups(CHASSIS_GROUPS);
  return world.createCollider(desc, chassis);
}

/**
 * TrackedVehicleSpec → Rapier bodies + joints (no visuals, no chain).
 * Road wheels hang on the sliding strut suspension, like the wheeled vehicle, with a track-wide collider.
 * Idler and sprocket are small colliders fixed on the chassis.
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

  const reach = Math.max(Math.abs(spec.idler.z), Math.abs(spec.sprocket.z), ...spec.axles.map((a) => Math.abs(a.z)));
  const chassis = createChassis(R, world, spec.chassis, pos, reach + FRAME_END_MARGIN);
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

  const endColliders = [spec.idler, spec.sprocket].flatMap((w) => [-spec.track / 2, spec.track / 2].map((x) => addEndCollider(R, world, chassis, w, x)));
  return { chassis, corners, joints: ctx.joints, mounts: ctx.mounts, names, endColliders };
}
