import type { SuspensionType, WheelShape } from './vehicleSpec';

/**
 * Rules of the custom vehicle profile: value limits, which suspensions fit which wheel layout and steering, and UI labels.
 * Pure data, no builder logic.
 */

/** What a custom axle does with the steering input */
export type SteerMode = 'none' | 'steer' | 'counter';

/** Wheels of one axle: a left/right pair, one centered wheel, or two wheels side by side at the center */
export type WheelLayout = 'pair' | 'center' | 'centerDouble';

export const CUSTOM_LIMITS = {
  axles: [1, 5],
  wheelbase: [1, 10],
  track: [1, 3.2],
  wheelRadius: [0.2, 0.6],
  wheelWidth: [0.15, 0.5],
  torque: [200, 30000],
  power: [5, 1000],
  wheelspin: [2.5, 15],
  weight: [300, 30000],
  handbrakeTorque: [0, 20000],
  comOffset: { x: [-0.5, 0.5], y: [-0.6, 0.6], z: [-2, 2] },
} as const;

/** Suspension types that can carry a steering knuckle (long-arm and beam types are non-steering only) */
export const STEERABLE_SUSPENSIONS: SuspensionType[] = ['strut', 'doubleWishbone', 'macPherson', 'swingAxle', 'solidAxle', 'multiLink', 'fourLink'];

export const ALL_SUSPENSIONS: SuspensionType[] = [
  ...STEERABLE_SUSPENSIONS,
  'trailingArm',
  'semiTrailingArm',
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
