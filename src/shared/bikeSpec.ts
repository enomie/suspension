import type { AxleSpec, DriveSpec, LowerColliderSpec, Vec3, VehicleSpec } from './vehicleSpec';

/**
 * Bike description (motorcycle, moped), pure (no Rapier/three), like `TrackedVehicleSpec` for tracked vehicles.
 * The layout is fixed: one front wheel on a telescopic fork (steers), one rear wheel on a swingarm (drives), torus
 * tires, balance assist. The spec only holds what differs between bikes; `bikeVehicleSpec()` derives everything else.
 * Forward = −Z; the chassis origin sits at the middle of the wheelbase.
 */

/** One torus tire (`shared/unitTorus.ts`): radius and width are free, the shape is always the apokalypto torus */
export interface BikeWheelSpec {
  /** [m] */
  radius: number;
  /** tire width [m], `BIKE_LIMITS.widthPerRadius` × radius */
  width: number;
  /** [kg] */
  mass: number;
  friction: number;
}

export interface BikeVehicleSpec {
  type: 'bike';
  name: string;
  /** display name (HUD) */
  label?: string;
  /** front to rear axle [m] */
  wheelbase: number;
  front: BikeWheelSpec;
  rear: BikeWheelSpec;
  /** total mass including the wheels [kg] */
  mass: number;
  /** center of mass relative to the chassis box center [m] (−z = front); limited by `bikeComLimits()` */
  comOffset: Vec3;
  /** the frame box between the wheels as a low-friction collider (and preview box); false = only the tires collide */
  colliderBox: boolean;
  drive: DriveSpec;
  /** handbrake torque on the rear wheel [N·m] */
  rearBrakeTorque: number;
}

/** Single-track balance assist: steering feedback while moving, a virtual stand while (nearly) stopped */
export interface BalanceSpec {
  /** speed above which steering alone balances [m/s]; below it the virtual stand fades in */
  standSpeed: number;
  /** max lean angle commanded by steering input [rad] */
  maxLean: number;
  /** stand stiffness [N·m/rad] and damping [N·m·s/rad] */
  standStiffness: number;
  standDamping: number;
  /**
   * lean of the center of mass line when the chassis is upright [rad], + = right: a center of mass off the center
   * plane (`comOffset` x) balances with the chassis tilted the other way, not upright
   */
  comLean: number;
}

/** Value limits of a bike [min, max] */
export const BIKE_LIMITS = {
  wheelbase: [0.5, 3],
  wheelRadius: [0.1, 1],
  /** tire width as a share of the radius (0.6 = apokalypto default, `torusWheelWidth`) */
  widthPerRadius: [0.2, 0.8],
  /** total mass [kg] */
  mass: [30, 2000],
  /** lateral center of mass offset [m]: anything else makes the bike pull to one side all the time */
  comX: [-0.05, 0.05],
} as const;

// ── derived geometry (all values in this block are design rules, not settings) ─────────────────
/** chassis box (mass, inertia) width [m]; the box itself is never drawn and has no collider */
const CHASSIS_WIDTH = 0.3;
/** the chassis box is this much longer than the wheelbase [m] */
const CHASSIS_EXTRA_LENGTH = 0.1;
/** chassis box height = this × the larger wheel radius, at least `MIN_CHASSIS_HEIGHT` [m] */
const CHASSIS_HEIGHT_PER_RADIUS = 2;
const MIN_CHASSIS_HEIGHT = 0.3;
/** steering-head angle from vertical [rad] (26°) */
const RAKE = 0.45;
/** trail per front wheel radius (0.31 m wheel → 0.1 m) */
const TRAIL_PER_RADIUS = 0.32;
/** suspension travel per wheel radius, either direction (0.31 m wheel → 0.12 m) */
const TRAVEL_PER_RADIUS = 0.39;
const FRONT_SPRING_HZ = 2;
const REAR_SPRING_HZ = 2.2;
const DAMPING_RATIO = 0.4;
const STEER_LOCK = 0.5;
/** service brakes: torque = share × weight × wheel radius (front brakes harder) */
const FRONT_BRAKE_SHARE = 0.65;
const REAR_BRAKE_SHARE = 0.5;
/** swingarm: about two rear wheel radii from pivot to axle, at least this long [m] (if the wheelbase allows) */
const MIN_ARM_LENGTH = 0.5;
/** frame box: gap to the rear tire, and to the front tire besides the fork travel [m] */
const FRAME_TIRE_GAP = 0.04;
/** the fork compresses along the raked axis, so the front wheel moves back by about this share of its travel */
const FORK_TRAVEL_BACK = Math.tan(RAKE);
/** shortest frame box [m]; with the gaps it sets the shortest wheelbase for two wheels (`minBikeWheelbase`) */
const MIN_FRAME_LENGTH = 0.1;
/** frame box height per larger wheel radius, width per larger wheel radius (clamped) [m] */
const FRAME_HEIGHT_PER_RADIUS = 0.9;
const MIN_FRAME_HEIGHT = 0.12;
const FRAME_WIDTH_PER_RADIUS = 0.5;
const FRAME_WIDTH: readonly [number, number] = [0.15, 0.25];
const FRAME_FRICTION = 0.15;
/** center of mass: stays this share of the wheelbase inside either axle, and this high above the ground at least [m] */
const COM_Z_MARGIN = 0.15;
const MIN_COM_HEIGHT = 0.1;
/** balance: stand stiffness and damping per tipping torque m·g·h (stiffness ≈ 8× what gravity tips, damping 0.8 s) */
const STAND_STIFFNESS_PER_TIP = 8;
const STAND_DAMPING_PER_TIP = 0.8;
const STAND_SPEED = 5;
const MAX_LEAN = 0.6;

/** gravity [m/s²], same as the physics world */
const G = 9.81;

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));
const inRange = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/** suspension travel of a wheel, either direction [m] */
export const bikeTravel = (radius: number) => TRAVEL_PER_RADIUS * radius;

/** gap between the front tire and the frame box: fixed gap plus how far the fork moves the wheel back [m] */
const frontFrameGap = (frontRadius: number) => FRAME_TIRE_GAP + FORK_TRAVEL_BACK * bikeTravel(frontRadius);

/** shortest wheelbase for these two wheels: tires, gaps and the shortest frame box fit between the axles [m] */
export function minBikeWheelbase(frontRadius: number, rearRadius: number): number {
  return Math.max(BIKE_LIMITS.wheelbase[0], frontRadius + rearRadius + frontFrameGap(frontRadius) + FRAME_TIRE_GAP + MIN_FRAME_LENGTH);
}

/** Heights in chassis space [m]: chassis box height, ground line and the two wheel centers */
export function bikeHeights(spec: Pick<BikeVehicleSpec, 'front' | 'rear'>): { boxHeight: number; ground: number; frontY: number; rearY: number } {
  const big = Math.max(spec.front.radius, spec.rear.radius);
  const boxHeight = Math.max(MIN_CHASSIS_HEIGHT, CHASSIS_HEIGHT_PER_RADIUS * big);
  // the larger wheel's center sits at the bottom of the box; both tires touch the same ground line, so the bike is level
  const ground = -boxHeight / 2 - big;
  return { boxHeight, ground, frontY: ground + spec.front.radius, rearY: ground + spec.rear.radius };
}

/** Where the center of mass may sit, per axis [min, max] (chassis box space) */
export function bikeComLimits(spec: Pick<BikeVehicleSpec, 'front' | 'rear' | 'wheelbase'>): { x: readonly [number, number]; y: readonly [number, number]; z: readonly [number, number] } {
  const { boxHeight, ground } = bikeHeights(spec);
  const half = spec.wheelbase / 2 - COM_Z_MARGIN * spec.wheelbase;
  return { x: BIKE_LIMITS.comX, y: [ground + MIN_COM_HEIGHT, boxHeight], z: [-half, half] };
}

/** Center of mass offset clamped into `bikeComLimits` */
export function clampBikeCom(spec: Pick<BikeVehicleSpec, 'front' | 'rear' | 'wheelbase'>, [x, y, z]: Vec3): Vec3 {
  const L = bikeComLimits(spec);
  return [clamp(x, L.x), clamp(y, L.y), clamp(z, L.z)];
}

/**
 * The frame box between the wheels (chassis space): on the center line, clear of both tires (also at full fork
 * travel), from the higher axle line up to about seat height.
 */
export function bikeFrameBox(spec: Pick<BikeVehicleSpec, 'front' | 'rear' | 'wheelbase'>): LowerColliderSpec {
  const { frontY, rearY } = bikeHeights(spec);
  const big = Math.max(spec.front.radius, spec.rear.radius);
  const start = -spec.wheelbase / 2 + spec.front.radius + frontFrameGap(spec.front.radius);
  const end = spec.wheelbase / 2 - spec.rear.radius - FRAME_TIRE_GAP;
  const height = Math.max(MIN_FRAME_HEIGHT, FRAME_HEIGHT_PER_RADIUS * big);
  const bottom = Math.max(frontY, rearY);
  return {
    size: [clamp(FRAME_WIDTH_PER_RADIUS * big, FRAME_WIDTH), height, Math.max(MIN_FRAME_LENGTH, end - start)],
    position: [0, bottom + height / 2, (start + end) / 2],
    friction: FRAME_FRICTION,
  };
}

/** sprung mass: everything but the two wheels [kg] */
export const bikeChassisMass = (spec: Pick<BikeVehicleSpec, 'mass' | 'front' | 'rear'>) => spec.mass - spec.front.mass - spec.rear.mass;

/** Balance assist, scaled by the tipping torque m·g·h (sprung mass × center of mass height above the ground) */
export function bikeBalance(spec: BikeVehicleSpec): BalanceSpec {
  const { ground } = bikeHeights(spec);
  const height = Math.max(MIN_COM_HEIGHT, spec.comOffset[1] - ground);
  const tip = bikeChassisMass(spec) * G * height;
  return {
    standSpeed: STAND_SPEED,
    maxLean: MAX_LEAN,
    standStiffness: STAND_STIFFNESS_PER_TIP * tip,
    standDamping: STAND_DAMPING_PER_TIP * tip,
    comLean: Math.atan2(spec.comOffset[0], height),
  };
}

/** pivot-to-axle length of the swingarm: about two rear radii, never reaching the front tire [m] */
function armLength(spec: BikeVehicleSpec): number {
  return Math.min(Math.max(MIN_ARM_LENGTH, 2 * spec.rear.radius), spec.wheelbase - spec.front.radius - FRAME_TIRE_GAP);
}

/**
 * The bike as a wheeled description: what the builder and the renderer use (fork, swingarm, wheels, chassis box,
 * frame box). All values not in `BikeVehicleSpec` are derived here.
 */
export function bikeVehicleSpec(spec: BikeVehicleSpec): VehicleSpec {
  const { boxHeight, frontY, rearY } = bikeHeights(spec);
  const weight = spec.mass * G;
  const wheel = (w: BikeWheelSpec) => ({ ...w, shape: 'torus' as const, hideKnuckle: true });
  const frontTravel = bikeTravel(spec.front.radius);
  const rearTravel = bikeTravel(spec.rear.radius);
  const front: AxleSpec = {
    z: -spec.wheelbase / 2,
    track: 0,
    y: frontY,
    suspension: 'telescopicFork',
    fork: { rake: RAKE, trail: TRAIL_PER_RADIUS * spec.front.radius },
    spring: { frequencyHz: FRONT_SPRING_HZ, dampingRatio: DAMPING_RATIO, travel: [-frontTravel, frontTravel] },
    wheel: wheel(spec.front),
    steer: { maxAngle: STEER_LOCK },
    brake: { torque: FRONT_BRAKE_SHARE * weight * spec.front.radius },
  };
  const rear: AxleSpec = {
    z: spec.wheelbase / 2,
    track: 0,
    y: rearY,
    suspension: 'swingArm',
    armLength: armLength(spec),
    spring: { frequencyHz: REAR_SPRING_HZ, dampingRatio: DAMPING_RATIO, travel: [-rearTravel, rearTravel] },
    wheel: wheel(spec.rear),
    drive: { share: 1 },
    brake: { torque: REAR_BRAKE_SHARE * weight * spec.rear.radius },
    handbrake: { torque: spec.rearBrakeTorque },
  };
  return {
    name: spec.name,
    label: spec.label,
    chassis: {
      size: [CHASSIS_WIDTH, boxHeight, spec.wheelbase + CHASSIS_EXTRA_LENGTH],
      mass: bikeChassisMass(spec),
      comOffset: spec.comOffset,
      frame: false,
      // no ladder frame: either the frame box (low friction) or no chassis collider at all
      colliders: [],
      lowerCollider: spec.colliderBox ? bikeFrameBox(spec) : undefined,
    },
    axles: [front, rear],
    steering: { mode: 'ackermann', rate: 3, returnRate: 5, highSpeedFactor: 0.25 },
    drive: spec.drive,
    // slimmer springs and seats: the dampers on a bike are thin
    springStyle: 'slim',
  };
}

/**
 * Checks a bike description. Returns one message per problem, empty = valid.
 * Rules: values within `BIKE_LIMITS`, the wheels and the frame fit into the wheelbase (`minBikeWheelbase`), the
 * center of mass inside `bikeComLimits`, the wheels lighter than the bike.
 */
export function validateBikeSpec(spec: BikeVehicleSpec): string[] {
  const errors: string[] = [];
  const L = BIKE_LIMITS;
  const range = (name: string, v: number, r: readonly [number, number]) => {
    if (!inRange(v, r)) errors.push(`${name} ${v} outside ${r[0]}…${r[1]}`);
  };
  range('wheelbase', spec.wheelbase, L.wheelbase);
  range('mass', spec.mass, L.mass);
  for (const [name, w] of [['front', spec.front], ['rear', spec.rear]] as const) {
    range(`${name} radius`, w.radius, L.wheelRadius);
    range(`${name} width per radius`, Number((w.width / w.radius).toFixed(6)), L.widthPerRadius);
    if (!(w.mass > 0)) errors.push(`${name} wheel mass must be > 0`);
  }
  const min = minBikeWheelbase(spec.front.radius, spec.rear.radius);
  if (spec.wheelbase < min - 1e-9) errors.push(`wheelbase ${spec.wheelbase} too short for the wheels: at least ${min.toFixed(3)}`);
  if (!(bikeChassisMass(spec) > 0)) errors.push('mass must be larger than both wheels together');
  const com = bikeComLimits(spec);
  (['x', 'y', 'z'] as const).forEach((axis, k) => range(`comOffset ${axis}`, spec.comOffset[k], com[axis]));
  if (spec.rearBrakeTorque < 0) errors.push('rearBrakeTorque must be ≥ 0');
  return errors;
}

/** true for a bike description */
export function isBikeSpec(spec: { type?: string }): spec is BikeVehicleSpec {
  return spec.type === 'bike';
}
