import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { AxleSpec, CornerTelemetry, Side, Vec3 } from '../../shared/vehicleSpec';

export * from '../../shared/vehicleSpec';

/** point fixed on a body (local coordinates) — for visuals. */
export interface Attach {
  body: RAPIER.RigidBody;
  local: Vec3;
}

/** visual link between two body points (arm, spring, damper …). */
export interface LinkVisual {
  kind: 'rod' | 'beam' | 'spring' | 'damper';
  a: Attach;
  b: Attach;
}

/** Joint marker for the renderer (prismatic joints are not shown). Axis and point are body-local. */
export interface JointVisual {
  kind: 'spherical' | 'revolute';
  body: RAPIER.RigidBody;
  local: Vec3;
  axis: Vec3;
}

export interface Corner {
  id: string;
  axleIndex: number;
  side: Side;
  axle: AxleSpec;
  /** wheel center at design ride (chassis-local) */
  anchor: Vec3;
  /** carrier: body where knuckle (steer) or wheel attaches */
  carrier: RAPIER.RigidBody;
  knuckle?: RAPIER.RigidBody;
  wheel: RAPIER.RigidBody;
  joints: {
    steer?: RAPIER.RevoluteImpulseJoint;
    spin: RAPIER.RevoluteImpulseJoint;
  };
  /** all bodies for this corner (incl. arms), for dispose */
  bodies: RAPIER.RigidBody[];
  visuals: LinkVisual[];
  /** wheel spring rate [N/m] (at wheel center) */
  stiffness: number;
  /** static compression of wheel spring [m] (load / rate) */
  preload: number;
  telemetry: CornerTelemetry;
}
