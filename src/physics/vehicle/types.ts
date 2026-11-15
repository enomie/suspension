import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { AxleSpec, CornerTelemetry, Side, Vec3 } from '../../shared/vehicleSpec';

export * from '../../shared/vehicleSpec';

/** Punkt fest an einem Körper (lokale Koordinaten) – für Visuals. */
export interface Attach {
  body: RAPIER.RigidBody;
  local: Vec3;
}

/** Darstellungs-Element zwischen zwei Körperpunkten (Lenker, Feder, Dämpfer …). */
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
  /** Radmitte in Konstruktionslage (Chassis-lokal) */
  anchor: Vec3;
  /** Radträger: Körper, an dem Knuckle (Lenkung) bzw. Rad hängt */
  carrier: RAPIER.RigidBody;
  knuckle?: RAPIER.RigidBody;
  wheel: RAPIER.RigidBody;
  joints: {
    steer?: RAPIER.RevoluteImpulseJoint;
    spin: RAPIER.RevoluteImpulseJoint;
  };
  /** alle Körper dieses Corners (inkl. Lenker), für dispose */
  bodies: RAPIER.RigidBody[];
  visuals: LinkVisual[];
  /** Radfederrate [N/m] (auf Radmitte bezogen) */
  stiffness: number;
  /** statische Einfederung der Radfederrate [m] (Last / Rate) */
  preload: number;
  telemetry: CornerTelemetry;
}
