import { BIKE_LIMITS, clampBikeCom, minBikeWheelbase, type BikeVehicleSpec, type BikeWheelSpec } from './bikeSpec';
import { COM_OFFSET_LIMITS } from './customRules';
import { torusWheelWidth } from './unitTorus';
import type { Vec3 } from './vehicleSpec';

/**
 * Custom bike profile: the few numbers the bike panel edits, and the rules that turn them into a complete, valid
 * `BikeVehicleSpec`. Pure data, like `customTracked.ts` for tracked vehicles.
 */

export interface CustomBikeWheelConfig {
  radius: number;
  /** tire width [m] */
  width: number;
}

export interface CustomBikeConfig {
  /** front to rear axle [m] */
  wheelbase: number;
  front: CustomBikeWheelConfig;
  rear: CustomBikeWheelConfig;
  /** frame box between the wheels as a low-friction collider */
  colliderBox: boolean;
  /** total mass including the wheels [kg] */
  weight: number;
  /** center of mass offset from the chassis center [m] (−z = front) */
  comOffset: Vec3;
  /** handbrake torque on the rear wheel [N·m] */
  rearBrakeTorque: number;
  /** drive torque [N·m] */
  torque: number;
  /** engine power [kW] */
  power: number;
  /** slip limit [m/s] (`DriveSpec.maxSlipSpeed`) */
  wheelspin: number;
}

/** Field ranges of the panel; `buildBikeSpec` then applies the rules that depend on several values */
export const CUSTOM_BIKE_LIMITS = {
  wheelbase: BIKE_LIMITS.wheelbase,
  wheelRadius: BIKE_LIMITS.wheelRadius,
  /** any width the field accepts; the build keeps it within `BIKE_LIMITS.widthPerRadius` × radius */
  wheelWidth: [BIKE_LIMITS.wheelRadius[0] * BIKE_LIMITS.widthPerRadius[0], BIKE_LIMITS.wheelRadius[1] * BIKE_LIMITS.widthPerRadius[1]],
  weight: BIKE_LIMITS.mass,
  comOffset: COM_OFFSET_LIMITS,
  rearBrakeTorque: [0, 5000],
  torque: [20, 5000],
  power: [1, 500],
  wheelspin: [2.5, 15],
} as const;

/** like the motorcycle preset */
export const DEFAULT_CUSTOM_BIKE: CustomBikeConfig = {
  wheelbase: 1.4,
  front: { radius: 0.31, width: torusWheelWidth(0.31) },
  rear: { radius: 0.31, width: torusWheelWidth(0.31) },
  colliderBox: true,
  weight: 180,
  comOffset: [0, 0.1, 0.05],
  rearBrakeTorque: 600,
  torque: 350,
  power: 55,
  wheelspin: 2.5,
};

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** tire friction of every custom bike */
const WHEEL_FRICTION = 1.1;
/** wheel mass at radius 0.31 m [kg], scaled with the radius squared */
const WHEEL_MASS_AT_0_31 = 10;
/** the bike without its wheels weighs at least this much [kg] */
const MIN_CHASSIS_MASS = 20;
const REVERSE_SPEED = 3;

const wheelMass = (radius: number) => WHEEL_MASS_AT_0_31 * (radius / 0.31) ** 2;

function wheel(c: CustomBikeWheelConfig): BikeWheelSpec {
  const radius = clamp(c.radius, BIKE_LIMITS.wheelRadius);
  const [lo, hi] = BIKE_LIMITS.widthPerRadius;
  return { radius, width: clamp(c.width, [lo * radius, hi * radius]), mass: wheelMass(radius), friction: WHEEL_FRICTION };
}

/**
 * Config → complete, valid `BikeVehicleSpec` (invalid combinations are corrected, not rejected): the tire width stays
 * within its share of the radius, the wheelbase grows until both wheels and the frame fit (`minBikeWheelbase`), the
 * weight covers both wheels, and the center of mass stays inside `bikeComLimits`.
 */
export function buildBikeSpec(config: CustomBikeConfig): BikeVehicleSpec {
  const L = CUSTOM_BIKE_LIMITS;
  const front = wheel(config.front);
  const rear = wheel(config.rear);
  const wheelbase = Math.max(clamp(config.wheelbase, L.wheelbase), minBikeWheelbase(front.radius, rear.radius));
  const shape = { front, rear, wheelbase };
  return {
    type: 'bike',
    name: 'custom',
    label: 'Custom',
    ...shape,
    mass: Math.max(clamp(config.weight, L.weight), front.mass + rear.mass + MIN_CHASSIS_MASS),
    comOffset: clampBikeCom(shape, config.comOffset),
    colliderBox: config.colliderBox,
    drive: {
      maxTorque: clamp(config.torque, L.torque),
      maxPower: 1000 * clamp(config.power, L.power),
      reverseSpeed: REVERSE_SPEED,
      maxSlipSpeed: clamp(config.wheelspin, L.wheelspin),
    },
    rearBrakeTorque: clamp(config.rearBrakeTorque, L.rearBrakeTorque),
  };
}

/** rounded to micrometres, so the panel shows 0.9 and not 0.8999999999999999 */
const clean = (v: number) => Number(v.toFixed(6));

/** `BikeVehicleSpec` → config: the panel shows what a preset is made of (values are clamped to the field ranges) */
export function bikeConfigFromSpec(spec: BikeVehicleSpec): CustomBikeConfig {
  const L = CUSTOM_BIKE_LIMITS;
  const w = (s: BikeWheelSpec): CustomBikeWheelConfig => ({ radius: clean(clamp(s.radius, L.wheelRadius)), width: clean(clamp(s.width, L.wheelWidth)) });
  return {
    wheelbase: clean(clamp(spec.wheelbase, L.wheelbase)),
    front: w(spec.front),
    rear: w(spec.rear),
    colliderBox: spec.colliderBox,
    weight: clean(clamp(spec.mass, L.weight)),
    comOffset: spec.comOffset.map((x, k) => clean(clamp(x, L.comOffset[(['x', 'y', 'z'] as const)[k]]))) as Vec3,
    rearBrakeTorque: clean(clamp(spec.rearBrakeTorque, L.rearBrakeTorque)),
    torque: clean(clamp(spec.drive.maxTorque, L.torque)),
    power: clean(clamp(spec.drive.maxPower / 1000, L.power)),
    wheelspin: clean(clamp(spec.drive.maxSlipSpeed ?? L.wheelspin[0], L.wheelspin)),
  };
}
