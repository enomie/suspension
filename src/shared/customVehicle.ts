import type { AxleSpec, SuspensionType, VehicleSpec, WheelSpec } from './vehicleSpec';

/** What a custom axle does with the steering input */
export type SteerMode = 'none' | 'steer' | 'counter';

export interface CustomAxleConfig {
  /** distance between the two wheel centres of this axle [m] */
  track: number;
  steer: SteerMode;
  suspension: SuspensionType;
  /** driven axle (torque is shared equally between driven axles) */
  drive: boolean;
  wheelRadius: number;
  wheelWidth: number;
}

export interface CustomVehicleConfig {
  /** distance between the front and the rear axle [m]; axles are spaced evenly in between */
  wheelbase: number;
  /** index 0 = front axle */
  axles: CustomAxleConfig[];
}

export const CUSTOM_LIMITS = {
  axles: [1, 5],
  wheelbase: [1, 10],
  track: [1, 3.2],
  wheelRadius: [0.25, 0.6],
  wheelWidth: [0.15, 0.5],
} as const;

/** Suspension types that can carry a steering knuckle (long-arm and beam types are non-steering only) */
export const STEERABLE_SUSPENSIONS: SuspensionType[] = ['strut', 'doubleWishbone', 'macPherson', 'solidAxle', 'multiLink', 'fourLink'];

export const ALL_SUSPENSIONS: SuspensionType[] = [
  ...STEERABLE_SUSPENSIONS,
  'trailingArm',
  'semiTrailingArm',
  'swingAxle',
  'twistBeam',
  'bogie',
];

export const SUSPENSION_LABELS: Record<SuspensionType, string> = {
  strut: 'Sliding strut',
  doubleWishbone: 'Double wishbone',
  macPherson: 'McPherson',
  trailingArm: 'Trailing arm',
  semiTrailingArm: 'Semi-trailing arm',
  swingAxle: 'Swing axle',
  solidAxle: 'Solid axle',
  twistBeam: 'Twist beam',
  multiLink: 'Multi-link',
  bogie: 'Tandem bogie',
  fourLink: '4-link solid axle',
  telescopicFork: 'Telescopic fork',
  swingArm: 'Swingarm',
};

export function suspensionsFor(steer: SteerMode): SuspensionType[] {
  return steer === 'none' ? ALL_SUSPENSIONS : STEERABLE_SUSPENSIONS;
}

export const DEFAULT_CUSTOM: CustomVehicleConfig = {
  wheelbase: 3.2,
  axles: [
    { track: 1.6, steer: 'steer', suspension: 'doubleWishbone', drive: false, wheelRadius: 0.33, wheelWidth: 0.22 },
    { track: 1.6, steer: 'none', suspension: 'solidAxle', drive: true, wheelRadius: 0.33, wheelWidth: 0.22 },
  ],
};

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** Chassis centre height above the ground at design ride height (same as the presets) */
const RIDE_HEIGHT = 0.6;
/** The chassis box (mass, inertia) extends this far beyond the outer axles [m]; the visible frame does not */
const BOX_MARGIN = 0.7;

/** Config → complete VehicleSpec (pure data; invalid combinations are corrected, not rejected). */
export function buildCustomSpec(config: CustomVehicleConfig): VehicleSpec {
  const n = Math.round(clamp(config.axles.length, CUSTOM_LIMITS.axles));
  const wheelbase = clamp(config.wheelbase, CUSTOM_LIMITS.wheelbase);
  const mass = 500 + 350 * n;
  const half = n === 1 ? 0 : wheelbase / 2;

  const axles: AxleSpec[] = Array.from({ length: n }, (_, i) => {
    const c = config.axles[i];
    const radius = clamp(c.wheelRadius, CUSTOM_LIMITS.wheelRadius);
    const width = clamp(c.wheelWidth, CUSTOM_LIMITS.wheelWidth);
    const wheel: WheelSpec = { radius, width, mass: 20 * (radius / 0.33) ** 2, friction: 1.1, shape: 'ball' };
    // a steering axle needs a type that can carry a knuckle
    const suspension = suspensionsFor(c.steer).includes(c.suspension) ? c.suspension : suspensionsFor(c.steer)[0];
    const brake = (mass * 12 * radius) / (2 * n);
    return {
      z: n === 1 ? 0 : -half + (2 * half * i) / (n - 1),
      track: clamp(c.track, CUSTOM_LIMITS.track),
      y: radius - RIDE_HEIGHT,
      suspension,
      spring: { frequencyHz: i === 0 ? 1.6 : 1.8, dampingRatio: 0.4, travel: [-0.1, 0.12] },
      wheel,
      steer: c.steer === 'none' ? undefined : { maxAngle: 0.55, counter: c.steer === 'counter' || undefined },
      drive: c.drive ? { share: 1 } : undefined,
      brake: { torque: brake },
      handbrake: i === n - 1 ? { torque: brake * 3 } : undefined,
      bogieSpacing: suspension === 'bogie' ? radius * 2 + 0.4 : undefined,
    };
  });

  return {
    name: 'custom',
    label: 'Custom',
    chassis: { size: [1.4, 0.5, 2 * half + 2 * BOX_MARGIN], mass, comOffset: [0, -0.2, 0] },
    axles,
    steering: { mode: 'ackermann', rate: 2.5, returnRate: 4, highSpeedFactor: 0.35 },
    drive: { maxTorque: mass * 2, maxPower: mass * 300, reverseSpeed: 8 },
  };
}
