import type { VehicleSpec } from './vehicleSpec';

/** rolling resistance force [N]: the SAME at every wheel, always (independent of load and vehicle) */
export const ROLLING_FORCE_PER_WHEEL = 40;
/** air drag `F = k·v²` with k = ½·ρ·CdA = ½ · 1.2 kg/m³ · 0.8 m²: the SAME for every vehicle [kg/m] */
const DRAG_COEFF = 0.5 * 1.2 * 0.8;
/** boost (Shift) multiplies the drag by this: top speed ≈ 2× (v ∝ ∛(P / k) with power-limited thrust) */
const BOOST_DRAG_FACTOR = 0.25;

/** drag coefficient k [kg/m] */
export function dragCoeff(boost: boolean): number {
  return boost ? DRAG_COEFF * BOOST_DRAG_FACTOR : DRAG_COEFF;
}

/** drive force at the ground [N] at speed v: per driven axle torque-limited at low, power-limited at high speed */
function thrust(spec: VehicleSpec, v: number): number {
  let f = 0;
  for (const a of spec.axles) {
    if (a.drive) f += Math.min((spec.drive.maxTorque * a.drive.share) / a.wheel.radius, (spec.drive.maxPower * a.drive.share) / v);
  }
  return f;
}

/** top speed [m/s]: where thrust = rolling + air drag, by bisection (thrust falls, resistance rises with v); capped by the boost limiter */
export function topSpeed(spec: VehicleSpec, boost = false): number {
  const wheels = spec.axles.reduce((n, a) => n + (a.track === 0 ? 1 : 2), 0);
  const roll = ROLLING_FORCE_PER_WHEEL * wheels;
  const k = dragCoeff(boost);
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (thrust(spec, mid) > roll + k * mid * mid) lo = mid;
    else hi = mid;
  }
  return Math.min(lo, (boost && spec.drive.maxBoostSpeed) || Infinity);
}
