import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { Object3D } from 'three';

/** L = links (−X), R = rechts (+X), C = Mitte (Motorrad). Vorwärts = −Z. */
export type Side = 'L' | 'R' | 'C';
export type SuspensionType =
  | 'strut' //            1 Schiebe-Federbein (Prismatic senkrecht)
  | 'doubleWishbone' //   2 Doppelquerlenker
  | 'macPherson' //       3 McPherson (schräges Federbein + unterer Querlenker)
  | 'trailingArm' //      4 Längslenker (auch Motorrad-Schwinge)
  | 'semiTrailingArm' //  5 Schräglenker
  | 'swingAxle' //        6 Pendelachse
  | 'solidAxle' //        7 Starrachse
  | 'twistBeam' //        8 Verbundlenker
  | 'multiLink' //        9 Mehrlenker (5 Stäbe)
  | 'bogie'; //           0 Tandem-Pendel (Wippe mit 2 Rädern je Seite)
export type Vec3 = [number, number, number];

export interface SpringDamperSpec {
  /** Eigenfrequenz [Hz] – alternativ `stiffness` */
  frequencyHz?: number;
  /** Dämpfungsgrad ζ – alternativ `damping` */
  dampingRatio?: number;
  /** Federrate [N/m] */
  stiffness?: number;
  /** Dämpferkonstante [N·s/m] */
  damping?: number;
  /** Federweg relativ zur Konstruktionslage [m]: [−Einfedern, +Ausfedern] */
  travel: [number, number];
}

export interface WheelSpec {
  radius: number;
  width: number;
  mass: number;
  friction: number;
  shape?: 'ball' | 'roundCylinder';
}

export interface AxleSpec {
  /** Längsposition relativ zum Chassis-Ursprung (−Z = vorn) */
  z: number;
  /** Spurweite (0 = ein Rad mittig) */
  track: number;
  /** Höhe Radmitte in Konstruktionslage, relativ zum Chassis-Ursprung */
  y: number;
  suspension: SuspensionType;
  spring: SpringDamperSpec;
  wheel: WheelSpec;
  /** lenkbar: maxAngle [rad] */
  steer?: { maxAngle: number };
  /** Tandem-Pendel: Radabstand längs [m] */
  bogieSpacing?: number;
  /** angetrieben: Anteil am Gesamtmoment */
  drive?: { share: number };
  brake: { torque: number };
  /** Handbremse (nur Hinterachsen) */
  handbrake?: { torque: number };
}

export interface ChassisSpec {
  /** Breite (X), Höhe (Y), Länge (Z) [m] */
  size: Vec3;
  mass: number;
  /** Schwerpunkt relativ zum Box-Mittelpunkt */
  comOffset?: Vec3;
  color?: number;
}

export interface SteeringSpec {
  /** ackermann: geometrisch je Achse (Hinterachsen lenken gegenläufig), crab: alle gleichsinnig */
  mode: 'ackermann' | 'crab';
  /** Lenkgeschwindigkeit [rad/s] */
  rate: number;
  /** Rückstellgeschwindigkeit [rad/s] */
  returnRate: number;
  /** Lenkwinkel bei vMax relativ zu 0 km/h (Lenkreduktion bei Speed), 0…1 */
  highSpeedFactor?: number;
}

export interface DriveSpec {
  /** Gesamtmoment an allen angetriebenen Rädern [N·m] */
  maxTorque: number;
  /** [m/s] */
  maxSpeed: number;
  reverseSpeed: number;
  /** Roll-/Lagerwiderstand je Rad [N·m] */
  rollingResistance: number;
}

export interface VehicleSpec {
  name: string;
  /** Anzeigename (HUD) */
  label?: string;
  chassis: ChassisSpec;
  /** Index 0 = vorderste Achse */
  axles: AxleSpec[];
  steering: SteeringSpec;
  drive: DriveSpec;
  jointMode?: 'impulse' | 'multibody';
}

export interface DriverInput {
  throttle: number; // 0…1
  brake: number; // 0…1
  steer: number; // −1 (rechts) … +1 (links)
  handbrake: boolean;
}

export interface CornerTelemetry {
  /** Federweg relativ zur Konstruktionslage [m], negativ = eingefedert */
  travel: number;
  /** Federkraft [N] */
  springForce: number;
  /** Raddrehzahl [rad/s], positiv = vorwärts */
  wheelOmega: number;
  steerAngle: number;
}

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
  wheelMesh: Object3D;
  telemetry: CornerTelemetry;
}
