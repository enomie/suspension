/** vehicle description (pure, no Rapier/three) — used by physics and rendering. */
/** L = left (−X), R = right (+X), C = center (motorcycle). Forward = −Z. */
export type Side = 'L' | 'R' | 'C';
export type SuspensionType =
  | 'strut' //            1 slider strut (vertical prismatic)
  | 'doubleWishbone' //   2 double wishbone
  | 'macPherson' //       3 MacPherson (inclined strut + lower control arm)
  | 'trailingArm' //      4 trailing arm
  | 'semiTrailingArm' //  5 semi-trailing arm
  | 'swingAxle' //        6 swing axle
  | 'solidAxle' //        7 solid axle
  | 'twistBeam' //        8 twist beam
  | 'multiLink' //        9 multi-link (5 links)
  | 'bogie' //            0 tandem bogie (rocker with 2 wheels per side)
  | 'fourLink' //        4-link solid axle (2 lower trailing arms + 2 triangulated upper links)
  | 'springLeg' //        cantilever spring-steel leg angled outward (light-aircraft main gear), non-steering
  | 'swingArm' //         motorcycle rear: swingarm with mono-shock (single centered wheel)
  | 'telescopicFork'; //  motorcycle front: raked telescopic fork (slides + steers about the rake axis)
export type Vec3 = [number, number, number];

export interface SpringDamperSpec {
  /** natural frequency [Hz] — or use `stiffness` */
  frequencyHz?: number;
  /** damping ratio ζ — or use `damping` */
  dampingRatio?: number;
  /** spring rate [N/m] */
  stiffness?: number;
  /** damper constant [N·s/m] */
  damping?: number;
  /** suspension travel from design ride [m]: [−compress, +extend] */
  travel: [number, number];
  /** Length of the spring/damper unit at design height [m] (default 0.45) */
  length?: number;
}

/** cylinder = plain round cylinder; torus = apokalypto bike tire (default width 0.6·radius, see `torusWheelWidth`) */
export type WheelShape = 'cylinder' | 'torus';

export interface WheelSpec {
  radius: number;
  width: number;
  mass: number;
  friction: number;
  /** collider and visual */
  shape: WheelShape;
  /** true = no grey wheel-carrier box is drawn (motorcycle, moped: fork slider / swingarm are the carrier) */
  hideKnuckle?: boolean;
}

export interface AxleSpec {
  /** longitudinal position relative to chassis origin (−Z = front) */
  z: number;
  /** track width (0 = single centered wheel) */
  track: number;
  /** wheel center height at design ride, relative to chassis origin */
  y: number;
  suspension: SuspensionType;
  spring: SpringDamperSpec;
  wheel: WheelSpec;
  /** Steerable: maxAngle [rad]; `counter` = steers against the front axle (rear-wheel steering) */
  steer?: { maxAngle: number; counter?: boolean };
  /** telescopicFork: steering-head rake from vertical [rad] and trail [m] (default 0.45 rad / 0.10 m) */
  fork?: { rake: number; trail: number };
  /** swingArm: pivot-to-axle length [m] (default: two wheel radii, at least 0.5 m) */
  armLength?: number;
  /** Double wishbone: horizontal reach of the lower arm from the ball joint to the chassis pivot [m] (default 0.45) */
  armSpan?: number;
  /** tandem bogie: wheel spacing along axle [m] */
  bogieSpacing?: number;
  /** `track` 0 only, `strut` only: two wheels side by side on the centered strut (twin nose wheel) */
  twin?: boolean;
  /** driven: share of total torque */
  drive?: { share: number };
  /**
   * driven axles with a left and a right wheel only (`track` > 0, see `hasDifferential`). Open differential unless `false`: the wheels of the axle turn independently. `false` = no differential
   * (spooled axle): the wheels are forced to the same speed. The driver can also lock differentials (`DriverInput.diffLock`).
   * Shown as a sphere in the preview.
   */
  differential?: boolean;
  brake: { torque: number };
  /** handbrake: acts on this axle regardless of the service brake */
  handbrake?: { torque: number };
}

/**
 * collider primitives (chassis-local), e.g. from an asset editor. rotation as quaternion [x, y, z, w].
 *   box: size = full edge lengths · sphere: radius · capsule/cylinder: radius + height (axis Y)
 *   rounded: edge rounding [m] for box/cylinder (slides better over terrain edges)
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

/**
 * Coarse body block on top of the ladder frame, like the `collider-lower-...` colliders of the real game (low friction).
 * Chassis-local. Collider and preview mesh come from the same data. It has no mass of its own: the vehicle weight is the total.
 */
export interface LowerColliderSpec {
  /** full edge lengths [m] */
  size: Vec3;
  position: Vec3;
  friction: number;
}

export interface ChassisSpec {
  /** width (X), height (Y), length (Z) [m] of the inertia box (and the frame height). The ladder frame itself has a fixed width. */
  size: Vec3;
  /**
   * collision from primitives. default: rounded ladder frame (= default visuals). An empty list = no chassis collider
   * besides `lowerCollider` (bikes).
   * keep close to visible shape — an invisible oversized collider acts like a wall.
   */
  colliders?: ColliderPrimitive[];
  /** coarse body block collider and preview box (optional) */
  lowerCollider?: LowerColliderSpec;
  mass: number;
  /**
   * The one centre of mass, relative to the box centre. Nothing else shifts it: colliders (frame, `lowerCollider`,
   * `colliders`) carry no mass, and the vehicle weight is the total.
   */
  comOffset?: Vec3;
  color?: number;
  /** false = no ladder frame is drawn (single-track vehicles: only suspension and points show) */
  frame?: boolean;
}

export interface SteeringSpec {
  /** ackermann: geometric per axle (rear axles steer opposite), crab: all same direction */
  mode: 'ackermann' | 'crab';
  /** steer rate [rad/s] */
  rate: number;
  /** return-to-center rate [rad/s] */
  returnRate: number;
  /** steer angle at vMax relative to standstill (high-speed reduction), 0…1 */
  highSpeedFactor?: number;
}

export interface DriveSpec {
  /** total torque at all driven wheels [N·m]: caps the thrust at low speed (traction, wheelspin) */
  maxTorque: number;
  /** engine power [W] split over the driven axles by `share`: caps the thrust at high speed (thrust ≤ P / v) */
  maxPower: number;
  /**
   * Top speed is not set directly: it is where thrust equals rolling + air drag, both the same for all vehicles
   * (see `topSpeed()` in shared/performance.ts). Only for vehicles that get unstable beyond some speed:
   * limiter with boost (Shift) [m/s]; boost cuts the air drag to a quarter (≈ 2× top speed).
   */
  maxBoostSpeed?: number;
  reverseSpeed: number;
  /** slip limit (ASR): wheel tangential speed may exceed vehicle speed by this much [m/s]; default 2.5. Higher = more wheelspin. */
  maxSlipSpeed?: number;
}

export interface VehicleSpec {
  /** vehicle type: wheeled (default); tracked vehicles use `TrackedVehicleSpec`, bikes `BikeVehicleSpec` */
  type?: 'wheeled';
  name: string;
  /** display name (HUD) */
  label?: string;
  chassis: ChassisSpec;
  /** index 0 = frontmost axle */
  axles: AxleSpec[];
  steering: SteeringSpec;
  drive: DriveSpec;
  /** visual only: `slim` = thinner spring coils with tighter windings and smaller seats (bikes) */
  springStyle?: 'default' | 'slim';
  jointMode?: 'impulse' | 'multibody';
}

/**
 * true when the axle has an open differential: it is driven, `differential` is not `false`, and it has a left and a
 * right wheel (`track` > 0). A single centered wheel or a twin wheel on one centered strut has no pair to split the
 * torque between, so it never has one (physics: `parts/differential.ts`).
 */
export function hasDifferential(axle: Pick<AxleSpec, 'drive' | 'differential' | 'track'>): boolean {
  return !!axle.drive && axle.differential !== false && axle.track > 0;
}

/** Steps the driver cycles through with the lock key: open, 25, 50, 75 %, fully locked */
export const DIFF_LOCK_LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;

export interface CornerTelemetry {
  /** suspension travel from design ride [m], negative = compressed */
  travel: number;
  /** spring force [N] */
  springForce: number;
  /** wheel angular rate [rad/s], positive = forward */
  wheelOmega: number;
  steerAngle: number;
}


/** Profile of the ladder frame rails [m] */
export const FRAME_RAIL = 0.1;
/** Outer width of the ladder frame [m]: the same for every vehicle (the frame is an orientation aid, not the body) */
export const FRAME_OUTER_WIDTH = 0.5;
/** Distance of each side rail from the centre line [m] */
export const FRAME_RAIL_X = (FRAME_OUTER_WIDTH - FRAME_RAIL) / 2;

/** The side rails run this far above the bottom of the chassis box [m] */
const FRAME_BOTTOM_OFFSET = 0.1;

/** Height of the centre line of the side rails in chassis space [m] (`chassisHeight` = `chassis.size[1]`) */
export function frameRailY(chassisHeight: number): number {
  return -chassisHeight / 2 + FRAME_BOTTOM_OFFSET + FRAME_RAIL / 2;
}

/** Height of the top of the side rails in chassis space [m] */
export function frameTopY(spec: VehicleSpec): number {
  return frameRailY(spec.chassis.size[1]) + FRAME_RAIL / 2;
}

/** Vertical slot the block is centred in, on top of the side rails [m] */
const LOWER_COLLIDER_SLOT = 0.35;
/** The block is this much lower than its slot (half at the top, half at the bottom), so its faces never coincide with the rail tops (no z-fighting) [m] */
const LOWER_COLLIDER_CLEARANCE = 0.02;
const LOWER_COLLIDER_HEIGHT = LOWER_COLLIDER_SLOT - LOWER_COLLIDER_CLEARANCE;
/** the block is longer than the frame by this much [m] (half at each end) */
const LOWER_COLLIDER_EXTRA_LENGTH = 0.5;
const LOWER_COLLIDER_FRICTION = 0.15;

/** Default `collider-lower` block: as wide as the frame, 0.5 m longer, 0.33 m high, centred where a 0.35 m block resting on the side rails would be (1 cm gap above the rails) */
export function defaultLowerCollider(spec: VehicleSpec): LowerColliderSpec {
  return {
    size: [FRAME_OUTER_WIDTH, LOWER_COLLIDER_HEIGHT, frameHalfLength(spec) * 2 + LOWER_COLLIDER_EXTRA_LENGTH],
    position: [0, frameTopY(spec) + LOWER_COLLIDER_SLOT / 2, 0],
    friction: LOWER_COLLIDER_FRICTION,
  };
}

/** Half the depth of a cross member: the side rails end flush with the outer cross members [m] */
const CROSS_MEMBER_HALF_DEPTH = 0.04;

/**
 * Half length of the visible ladder frame (and of its collider): the two side rails run from the front axle to the
 * rear axle, one cross member per axle, nothing sticks out. Mass and inertia still come from the full `chassis.size`.
 */
export function frameHalfLength(spec: Pick<VehicleSpec, 'axles'>): number {
  const reach = Math.max(0, ...spec.axles.map((a) => Math.abs(a.z)));
  // a single axle still needs rails long enough for a valid collider
  return Math.max(0.3, reach + CROSS_MEMBER_HALF_DEPTH);
}
