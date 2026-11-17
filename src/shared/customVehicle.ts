import { torusWheelWidth } from './unitTorus';
import type { AxleSpec, SuspensionType, VehicleSpec, WheelShape, WheelSpec } from './vehicleSpec';

/** What a custom axle does with the steering input */
export type SteerMode = 'none' | 'steer' | 'counter';

/** Wheels of one axle: a left/right pair, one centered wheel, or two wheels side by side at the center */
export type WheelLayout = 'pair' | 'center' | 'centerDouble';


export interface CustomAxleConfig {
  wheels: WheelLayout;
  /** distance between the two wheel centres of a `pair` axle [m] (ignored for centered wheels) */
  track: number;
  steer: SteerMode;
  suspension: SuspensionType;
  /** driven axle (torque is shared equally between driven axles) */
  drive: boolean;
  wheelShape: WheelShape;
  wheelRadius: number;
  /** tire width [m] of a `cylinder` wheel (a torus wheel gets its width from the radius) */
  wheelWidth: number;
}

export interface CustomVehicleConfig {
  /** distance between the front and the rear axle [m]; axles are spaced evenly in between */
  wheelbase: number;
  /** index 0 = front axle */
  axles: CustomAxleConfig[];
  /** total drive torque [N·m]: acceleration and wheelspin */
  torque: number;
  /** engine power [kW]: top speed together with rolling and air drag */
  power: number;
  /** wheelspin: how much faster than the ground a wheel may spin [m/s] (slip limit; 2.5 = hardly any) */
  wheelspin: number;
}

export const CUSTOM_LIMITS = {
  axles: [1, 5],
  wheelbase: [1, 10],
  track: [1, 3.2],
  wheelRadius: [0.25, 0.6],
  wheelWidth: [0.15, 0.5],
  torque: [200, 30000],
  power: [5, 1000],
  wheelspin: [2.5, 15],
} as const;

/** Suspension types that can carry a steering knuckle (long-arm and beam types are non-steering only) */
export const STEERABLE_SUSPENSIONS: SuspensionType[] = ['strut', 'doubleWishbone', 'macPherson', 'solidAxle', 'multiLink', 'fourLink'];

export const ALL_SUSPENSIONS: SuspensionType[] = [
  ...STEERABLE_SUSPENSIONS,
  'trailingArm',
  'semiTrailingArm',
  'swingAxle',
  'twistBeam',
  'springLeg',
  'bogie',
];

/**
 * Suspension types per wheel layout: `fixed` = usable without steering, `steered` = usable with steering.
 * Centered axles can only use builders that handle a single centered wheel (`track` 0).
 */
const SUSPENSIONS_BY_LAYOUT: Record<WheelLayout, { fixed: SuspensionType[]; steered: SuspensionType[] }> = {
  pair: { fixed: ALL_SUSPENSIONS, steered: STEERABLE_SUSPENSIONS },
  center: { fixed: ['strut', 'bogie', 'swingArm'], steered: ['strut', 'telescopicFork'] },
  centerDouble: { fixed: ['strut'], steered: ['strut'] },
};

export const WHEEL_SHAPE_LABELS: Record<WheelShape, string> = { cylinder: 'Cylinder', torus: 'Torus' };

export const WHEEL_LAYOUT_LABELS: Record<WheelLayout, string> = {
  pair: 'Wheel pair',
  center: 'Center wheel',
  centerDouble: 'Center double wheel',
};

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
  springLeg: 'Spring leg',
  bogie: 'Tandem bogie',
  fourLink: '4-link solid axle',
  telescopicFork: 'Telescopic fork',
  swingArm: 'Swingarm',
};

export function suspensionsFor(steer: SteerMode, wheels: WheelLayout = 'pair'): SuspensionType[] {
  const list = SUSPENSIONS_BY_LAYOUT[wheels];
  return steer === 'none' ? list.fixed : list.steered;
}

export const DEFAULT_CUSTOM: CustomVehicleConfig = {
  wheelbase: 3.2,
  axles: [
    { wheels: 'pair', track: 1.6, steer: 'steer', suspension: 'doubleWishbone', drive: false, wheelShape: 'cylinder', wheelRadius: 0.33, wheelWidth: 0.22 },
    { wheels: 'pair', track: 1.6, steer: 'none', suspension: 'solidAxle', drive: true, wheelShape: 'cylinder', wheelRadius: 0.33, wheelWidth: 0.22 },
  ],
  torque: 2400,
  power: 360,
  wheelspin: 2.5,
};

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** VehicleSpec → config: the panel shows what a preset is made of (only what the panel can express; values are clamped to its limits) */
export function customFromSpec(spec: VehicleSpec): CustomVehicleConfig {
  const axles = spec.axles.slice(0, CUSTOM_LIMITS.axles[1]);
  return {
    wheelbase: axles.length > 1 ? clamp(axles[axles.length - 1].z - axles[0].z, CUSTOM_LIMITS.wheelbase) : DEFAULT_CUSTOM.wheelbase,
    axles: axles.map((a) => ({
      wheels: a.track > 0 ? 'pair' : a.twin ? 'centerDouble' : 'center',
      track: a.track > 0 ? clamp(a.track, CUSTOM_LIMITS.track) : DEFAULT_CUSTOM.axles[0].track,
      steer: !a.steer ? 'none' : a.steer.counter ? 'counter' : 'steer',
      suspension: a.suspension,
      drive: !!a.drive,
      wheelShape: a.wheel.shape,
      wheelRadius: clamp(a.wheel.radius, CUSTOM_LIMITS.wheelRadius),
      wheelWidth: clamp(a.wheel.width, CUSTOM_LIMITS.wheelWidth),
    })),
    torque: clamp(spec.drive.maxTorque, CUSTOM_LIMITS.torque),
    power: clamp(spec.drive.maxPower / 1000, CUSTOM_LIMITS.power),
    wheelspin: clamp(spec.drive.maxSlipSpeed ?? DEFAULT_CUSTOM.wheelspin, CUSTOM_LIMITS.wheelspin),
  };
}

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
    const width = c.wheelShape === 'torus' ? torusWheelWidth(radius) : clamp(c.wheelWidth, CUSTOM_LIMITS.wheelWidth);
    const wheel: WheelSpec = { radius, width, mass: 20 * (radius / 0.33) ** 2, friction: 1.1, shape: c.wheelShape };
    // a steering axle needs a type that can carry a knuckle
    const allowed = suspensionsFor(c.steer, c.wheels);
    const suspension = allowed.includes(c.suspension) ? c.suspension : allowed[0];
    const brake = (mass * 12 * radius) / (2 * n);
    return {
      z: n === 1 ? 0 : -half + (2 * half * i) / (n - 1),
      track: c.wheels === 'pair' ? clamp(c.track, CUSTOM_LIMITS.track) : 0,
      y: radius - RIDE_HEIGHT,
      suspension,
      spring: { frequencyHz: i === 0 ? 1.6 : 1.8, dampingRatio: 0.4, travel: [-0.1, 0.12] },
      wheel,
      steer: c.steer === 'none' ? undefined : { maxAngle: 0.55, counter: c.steer === 'counter' || undefined },
      drive: c.drive ? { share: 1 } : undefined,
      brake: { torque: brake },
      handbrake: i === n - 1 ? { torque: brake * 3 } : undefined,
      bogieSpacing: suspension === 'bogie' ? radius * 2 + 0.4 : undefined,
      twin: c.wheels === 'centerDouble' || undefined,
    };
  });

  return {
    name: 'custom',
    label: 'Custom',
    chassis: { size: [1.4, 0.5, 2 * half + 2 * BOX_MARGIN], mass, comOffset: [0, -0.2, 0] },
    axles,
    steering: { mode: 'ackermann', rate: 2.5, returnRate: 4, highSpeedFactor: 0.35 },
    drive: {
      maxTorque: clamp(config.torque, CUSTOM_LIMITS.torque),
      maxPower: 1000 * clamp(config.power, CUSTOM_LIMITS.power),
      reverseSpeed: 8,
      maxSlipSpeed: clamp(config.wheelspin, CUSTOM_LIMITS.wheelspin),
    },
  };
}
