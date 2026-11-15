/** Fahrzeug-Beschreibung (rein, ohne Rapier/three) – von Physik und Optik genutzt. */
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
  | 'bogie' //            0 Tandem-Pendel (Wippe mit 2 Rädern je Seite)
  | 'fourLink'; //        4-link solid axle (2 lower trailing arms + 2 triangulated upper links)
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
  /** Length of the spring/damper unit at design height [m] (default 0.45) */
  length?: number;
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
  /** Double wishbone: horizontal reach of the lower arm from the ball joint to the chassis pivot [m] (default 0.45) */
  armSpan?: number;
  /** Tandem-Pendel: Radabstand längs [m] */
  bogieSpacing?: number;
  /** angetrieben: Anteil am Gesamtmoment */
  drive?: { share: number };
  brake: { torque: number };
  /** Handbremse (nur Hinterachsen) */
  handbrake?: { torque: number };
}

/**
 * Kollisions-Primitive (Chassis-lokal), z. B. aus einem Asset-Editor. Rotation als Quaternion [x, y, z, w].
 *   box: size = volle Kantenlängen · sphere: radius · capsule/cylinder: radius + height (Achse Y)
 *   rounded: Kantenrundung [m] für box/cylinder (gleitet besser über Terrain-Kanten)
 */
export interface ColliderPrimitive {
  shape: 'box' | 'sphere' | 'capsule' | 'cylinder';
  position: Vec3;
  rotation?: [number, number, number, number];
  size?: Vec3;
  radius?: number;
  height?: number;
  rounded?: number;
  friction?: number;
}

export interface ChassisSpec {
  /** Breite (X), Höhe (Y), Länge (Z) [m] – bestimmt Trägheit (und den Standard-Rahmen) */
  size: Vec3;
  /**
   * Kollisionsform aus Primitives. Ohne Angabe: abgerundeter Leiterrahmen (= Standard-Optik).
   * Wichtig: so nah wie möglich an der sichtbaren Form – ein unsichtbar größerer Collider wirkt wie eine Wand.
   */
  colliders?: ColliderPrimitive[];
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

