import type { AxleSpec, VehicleSpec } from './vehicleSpec';

/** rolling resistance force [N]: the SAME at every wheel, always (independent of load and vehicle) */
export const ROLLING_FORCE_PER_WHEEL = 40;
/** air density [kg/m³] */
const AIR_DENSITY = 1.2;
/** drag area Cd·A [m²] of every vehicle unless its `DriveSpec.dragArea` says otherwise (bikes are smaller) */
export const DEFAULT_DRAG_AREA = 0.8;
/** boost (Shift) multiplies the drag by this: top speed ≈ 2× (v ∝ ∛(P / k) with power-limited thrust) */
const BOOST_DRAG_FACTOR = 0.25;

/** air drag `F = k·v²` with k = ½·ρ·CdA [kg/m]; `dragArea` = Cd·A [m²] */
export function dragCoeff(boost: boolean, dragArea = DEFAULT_DRAG_AREA): number {
  const k = 0.5 * AIR_DENSITY * dragArea;
  return boost ? k * BOOST_DRAG_FACTOR : k;
}

/** drive force of one driven axle at the ground [N] at speed v: torque-limited at low, power-limited at high speed */
export function axleForce(spec: VehicleSpec, axle: AxleSpec, v: number): number {
  const share = axle.drive?.share ?? 0;
  return Math.min((spec.drive.maxTorque * share) / axle.wheel.radius, (spec.drive.maxPower * share) / v);
}

/** top speed [m/s]: where thrust = rolling + air drag, by bisection (thrust falls, resistance rises with v); capped by the boost limiter */
export function topSpeed(spec: VehicleSpec, boost = false): number {
  const wheels = spec.axles.reduce((n, a) => n + (a.track === 0 ? (a.twin ? 2 : 1) : 2), 0);
  const roll = ROLLING_FORCE_PER_WHEEL * wheels;
  const k = dragCoeff(boost, spec.drive.dragArea);
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (spec.axles.reduce((f, a) => f + axleForce(spec, a, mid), 0) > roll + k * mid * mid) lo = mid;
    else hi = mid;
  }
  return Math.min(lo, (boost && spec.drive.maxBoostSpeed) || Infinity);
}
