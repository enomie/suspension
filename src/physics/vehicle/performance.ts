import type { DriveSpec, VehicleSpec } from './types';

/** air density [kg/m³] */
export const AIR_DENSITY = 1.2;
/** drag area Cd·A [m²]: the SAME for every vehicle */
export const DRAG_AREA = 0.8;
/** rolling resistance force [N]: the SAME at every wheel, always (independent of load and vehicle) */
export const ROLLING_FORCE_PER_WHEEL = 40;
/** boost (Shift) multiplies the drag area by this: top speed ≈ 2× (v ∝ ∛(P / CdA) with power-limited thrust) */
export const BOOST_DRAG_FACTOR = 0.25;

/** wheel count of the vehicle (`track: 0` = one centered wheel per axle) */
export function wheelCount(spec: VehicleSpec): number {
  return spec.axles.reduce((n, a) => n + (a.track === 0 ? 1 : 2), 0);
}

/** rolling resistance force of the whole vehicle [N] */
export function rollingForce(spec: VehicleSpec): number {
  return ROLLING_FORCE_PER_WHEEL * wheelCount(spec);
}

/** air drag force [N] at speed v [m/s] */
export function dragForce(v: number, boost = false): number {
  return 0.5 * AIR_DENSITY * DRAG_AREA * (boost ? BOOST_DRAG_FACTOR : 1) * v * v;
}

/** drive force at the ground [N] at speed v: torque-limited at low, power-limited at high speed */
export function thrust(spec: VehicleSpec, v: number): number {
  const driven = spec.axles.filter((a) => a.drive);
  if (driven.length === 0) return 0;
  const share = driven.reduce((s, a) => s + (a.drive?.share ?? 0), 0);
  const r = driven[0].wheel.radius;
  return Math.min((spec.drive.maxTorque * share) / r, (spec.drive.maxPower * share) / Math.max(v, 1e-3));
}

/**
 * top speed [m/s]: where thrust = rolling + air drag, bisection (thrust falls, resistance rises with v).
 * With the ECU limiter (`maxSpeed` / `maxBoostSpeed`) it is capped there.
 */
export function topSpeed(spec: VehicleSpec, boost = false): number {
  const roll = rollingForce(spec);
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (thrust(spec, mid) > roll + dragForce(mid, boost)) lo = mid;
    else hi = mid;
  }
  const limit = boost ? spec.drive.maxBoostSpeed : spec.drive.maxSpeed;
  return Math.min(lo, limit ?? Infinity);
}

export type { DriveSpec };
