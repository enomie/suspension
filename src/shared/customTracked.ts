import { PLACEHOLDER_CHAIN_LINK } from './chainLink';
import { DEFAULT_MAX_SPEED, DEFAULT_TURN_SPEED } from './trackDrive';
import { TRACKED_LIMITS, type TrackedVehicleSpec } from './trackedSpec';
import type { AxleSpec } from './vehicleSpec';

/**
 * Custom tracked vehicle profile: the few numbers the panel edits, and the rules that turn them into a complete,
 * valid `TrackedVehicleSpec`. Pure data, like `customVehicle.ts` for wheeled vehicles.
 */

/** Idler (front) or sprocket (rear) as the panel sees it */
export interface CustomTrackEndConfig {
  /** distance from the centre of the outer road axle [m] */
  distance: number;
  /** height above the road wheel centres [m]: raise it for the triangular profile of a tank, negative = lower */
  raise: number;
  radius: number;
  width: number;
}

export interface CustomTrackedConfig {
  /** number of road axles, 2…5 */
  roadAxles: number;
  /** distance between neighbouring road axles [m] */
  axleSpacing: number;
  /** road wheel radius [m] (without the chain) */
  wheelRadius: number;
  /** distance between the centres of the left and right track [m] */
  track: number;
  /** width of one track [m] */
  beltWidth: number;
  /** thickness of the chain [m] */
  chainThickness: number;
  idler: CustomTrackEndConfig;
  sprocket: CustomTrackEndConfig;
  /** total vehicle mass including wheels [kg] */
  weight: number;
  /** total drive torque [N·m] */
  torque: number;
  /** engine power [kW] */
  power: number;
  /** track speed difference at full steer [m/s] */
  turnSpeed: number;
  /** top speed forward [m/s] */
  maxSpeed: number;
}

export const CUSTOM_TRACKED_LIMITS = {
  roadAxles: TRACKED_LIMITS.axles,
  axleSpacing: [0.6, 2],
  wheelRadius: TRACKED_LIMITS.wheelRadius,
  track: [1, 3.2],
  beltWidth: TRACKED_LIMITS.beltWidth,
  chainThickness: TRACKED_LIMITS.chainThickness,
  endDistance: [0.65, 2],
  endRaise: [-0.3, 1],
  endRadius: TRACKED_LIMITS.endWheelRadius,
  endWidth: TRACKED_LIMITS.endWheelWidth,
  weight: [2000, 60000],
  torque: [2000, 100000],
  power: [50, 2000],
  turnSpeed: TRACKED_LIMITS.turnSpeed,
  maxSpeed: TRACKED_LIMITS.maxSpeed,
} as const;

export const DEFAULT_CUSTOM_TRACKED: CustomTrackedConfig = {
  roadAxles: 4,
  axleSpacing: 1,
  wheelRadius: 0.3,
  track: 2,
  beltWidth: 0.55,
  chainThickness: 0.05,
  idler: { distance: 0.9, raise: 0.25, radius: 0.2, width: 0.45 },
  sprocket: { distance: 0.9, raise: 0.3, radius: 0.25, width: 0.45 },
  weight: 12800,
  torque: 44000,
  power: 400,
  turnSpeed: DEFAULT_TURN_SPEED,
  maxSpeed: DEFAULT_MAX_SPEED,
};

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** Road wheel friction: high enough to climb steep slopes (traction, not torque, limits the climb); the tracks still skid-steer at this thrust */
const WHEEL_FRICTION = 0.8;
/** Road wheel mass [kg] at radius 0.3 m, scaled with the radius squared */
const WHEEL_MASS_AT_0_3 = 100;
/** Chassis mass never drops below this, whatever the wheels weigh [kg] */
const MIN_CHASSIS_MASS = 500;
/** Road wheel centre height below the chassis origin, besides the radius [m] */
const AXLE_DROP = 0.2;
/** Gap kept between neighbouring wheels [m] */
const WHEEL_GAP = 0.05;
/** The chassis is this much wider than the track and longer than the road axle span [m] */
const BOX_EXTRA_WIDTH = 0.4;
const BOX_EXTRA_LENGTH = 2;
const CHASSIS_HEIGHT = 0.6;

const wheelMass = (radius: number) => WHEEL_MASS_AT_0_3 * (radius / 0.3) ** 2;

/** Config → complete, valid `TrackedVehicleSpec` (invalid combinations are corrected, not rejected). */
export function buildTrackedSpec(config: CustomTrackedConfig): TrackedVehicleSpec {
  const L = CUSTOM_TRACKED_LIMITS;
  const n = Math.round(clamp(config.roadAxles, L.roadAxles));
  const radius = clamp(config.wheelRadius, L.wheelRadius);
  const spacing = Math.max(clamp(config.axleSpacing, L.axleSpacing), 2 * radius + WHEEL_GAP);
  const track = clamp(config.track, L.track);
  const beltWidth = Math.min(clamp(config.beltWidth, L.beltWidth), track);
  const weight = clamp(config.weight, L.weight);
  const axleY = -AXLE_DROP - radius;

  const axles: AxleSpec[] = Array.from({ length: n }, (_, i) => ({
    z: (i - (n - 1) / 2) * spacing,
    track,
    y: axleY,
    suspension: 'strut',
    spring: { frequencyHz: 1.5, dampingRatio: 0.5, travel: [-0.15, 0.15] },
    wheel: { radius, width: beltWidth, mass: wheelMass(radius), friction: WHEEL_FRICTION, shape: 'cylinder' },
    brake: { torque: (weight * 9.81 * radius) / (2 * n) },
  }));
  const front = axles[0].z;
  const rear = axles[n - 1].z;

  const end = (c: CustomTrackEndConfig, outerZ: number, dir: -1 | 1) => {
    const r = clamp(c.radius, L.endRadius);
    const distance = Math.max(clamp(c.distance, L.endDistance), radius + r + WHEEL_GAP / 2);
    return {
      z: outerZ + dir * distance,
      y: clamp(axleY + clamp(c.raise, L.endRaise), TRACKED_LIMITS.endWheelY),
      radius: r,
      width: clamp(c.width, L.endWidth),
    };
  };

  return {
    type: 'tracked',
    name: 'custom',
    label: 'Custom',
    chassis: {
      size: [track + BOX_EXTRA_WIDTH, CHASSIS_HEIGHT, rear - front + BOX_EXTRA_LENGTH],
      mass: Math.max(MIN_CHASSIS_MASS, weight - 2 * n * wheelMass(radius)),
    },
    axles,
    idler: end(config.idler, front, -1),
    sprocket: end(config.sprocket, rear, 1),
    track,
    beltWidth,
    chainThickness: clamp(config.chainThickness, L.chainThickness),
    linkAsset: PLACEHOLDER_CHAIN_LINK.name,
    drive: { maxTorque: clamp(config.torque, L.torque), maxPower: 1000 * clamp(config.power, L.power), reverseSpeed: 5 },
    turnSpeed: clamp(config.turnSpeed, L.turnSpeed),
    maxSpeed: clamp(config.maxSpeed, L.maxSpeed),
  };
}

/** numbers rounded to micrometres, so the panel shows 0.9 and not 0.8999999999999999 */
const clean = <T>(v: T): T =>
  typeof v === 'number'
    ? (Number(v.toFixed(6)) as T)
    : v && typeof v === 'object'
      ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) as T)
      : v;

/** `TrackedVehicleSpec` → config: the panel shows what a preset is made of (values are clamped to its limits) */
export function trackedConfigFromSpec(spec: TrackedVehicleSpec): CustomTrackedConfig {
  return clean(configFromSpec(spec));
}

function configFromSpec(spec: TrackedVehicleSpec): CustomTrackedConfig {
  const L = CUSTOM_TRACKED_LIMITS;
  const n = spec.axles.length;
  const first = spec.axles[0];
  const last = spec.axles[n - 1];
  const radius = first.wheel.radius;
  const end = (w: TrackedVehicleSpec['idler'], distance: number): CustomTrackEndConfig => ({
    distance: clamp(distance, L.endDistance),
    raise: clamp(w.y - first.y, L.endRaise),
    radius: clamp(w.radius, L.endRadius),
    width: clamp(w.width, L.endWidth),
  });
  return {
    roadAxles: clamp(n, L.roadAxles),
    axleSpacing: n > 1 ? clamp((last.z - first.z) / (n - 1), L.axleSpacing) : DEFAULT_CUSTOM_TRACKED.axleSpacing,
    wheelRadius: clamp(radius, L.wheelRadius),
    track: clamp(spec.track, L.track),
    beltWidth: clamp(spec.beltWidth, L.beltWidth),
    chainThickness: clamp(spec.chainThickness, L.chainThickness),
    idler: end(spec.idler, first.z - spec.idler.z),
    sprocket: end(spec.sprocket, spec.sprocket.z - last.z),
    weight: clamp(spec.chassis.mass + spec.axles.reduce((m, a) => m + 2 * a.wheel.mass, 0), L.weight),
    torque: clamp(spec.drive.maxTorque, L.torque),
    power: clamp(spec.drive.maxPower / 1000, L.power),
    turnSpeed: clamp(spec.turnSpeed ?? DEFAULT_TURN_SPEED, L.turnSpeed),
    maxSpeed: clamp(spec.maxSpeed ?? DEFAULT_MAX_SPEED, L.maxSpeed),
  };
}
