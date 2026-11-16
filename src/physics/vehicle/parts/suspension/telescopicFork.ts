import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { LinkVisual } from '../../types';
import { cornerId, partId } from '../../ids';
import { add, finishCorner, helper, link, prismatic, prismaticSpring, springFor, v, W, wheelLocal, wheelRate, type P } from './common';
import type { AxleBuilder } from './types';

/** defaults: 26° steering-head angle, 100 mm trail */
const DEFAULT_RAKE = 0.45;
const DEFAULT_TRAIL = 0.1;
/** distance from the axle line up the steering axis to the triple clamp [m] */
const CLAMP_HEIGHT = 0.55;
/** length of the lower leg (slider) above the axle line [m] */
const SLIDER_LENGTH = 0.28;
/** distance from the axle line to the lower steering bearing [m] */
const LOWER_BEARING = 0.45;
/** gap between tire side and fork leg axis [m] */
const LEG_CLEARANCE = 0.1;

/**
 * 11 · telescopic fork (motorcycle front, single centered wheel)
 *   Chassis ─[Prismatic along the rake axis, motor = spring+damper]→ stanchion (= carrier)
 *   stanchion ─[Revolute about the same axis, steering]→ knuckle (lower legs + axle) ─[Revolute X]→ wheel
 *
 * Because slide and steer share one axis their order does not matter. The axis is tilted back by `fork.rake` and the
 * wheel center sits `offset` in front of it, so that the axis meets the ground `trail` ahead of the contact patch:
 *   trail = (R·sin ε − offset) / cos ε   →   offset = R·sin ε − trail·cos ε
 */
export const buildTelescopicFork: AxleBuilder = (ctx, axle, i) => {
  const side = 'C' as const;
  const id = cornerId(ctx.name, i, side);
  const wl = wheelLocal(axle, side);
  const wc = W(ctx, wl);
  const rate = wheelRate(ctx, axle, i, 1);

  const rake = axle.fork?.rake ?? DEFAULT_RAKE;
  const trail = axle.fork?.trail ?? DEFAULT_TRAIL;
  const sin = Math.sin(rake);
  const cos = Math.cos(rake);
  /** steering axis direction pointing up (top leans back = +Z), normal to it pointing forward */
  const up: P = v(0, cos, sin);
  const down: P = v(0, -cos, -sin);
  const fwd: P = v(0, sin, -cos);
  const offset = axle.wheel.radius * sin - trail * cos;
  // chassis-local point on the steering axis at wheel height (axle line)
  const axisL = v(wl.x - offset * fwd.x, wl.y - offset * fwd.y, wl.z - offset * fwd.z);
  const onAxis = (t: number): P => add(W(ctx, axisL), v(up.x * t, up.y * t, up.z * t));

  const carrier = helper(ctx, axle, wc, partId(id, 'stanchion'));
  const slide = prismatic(ctx, ctx.chassis, carrier, wc, down);
  // wheel moves along the (tilted) axis: vertical rate k_w → k_w·cos²ε along it (motion ratio 1/cos ε)
  const limits: [number, number] = [axle.spring.travel[0] / cos, axle.spring.travel[1] / cos];
  prismaticSpring(ctx, slide, springFor(rate, 1 / cos), limits);

  const clamp = onAxis(CLAMP_HEIGHT);
  const bearing = onAxis(LOWER_BEARING);
  // steering-head bolt points on the chassis
  ctx.mounts.push(
    [clamp.x - ctx.origin.x, clamp.y - ctx.origin.y, clamp.z - ctx.origin.z],
    [bearing.x - ctx.origin.x, bearing.y - ctx.origin.y, bearing.z - ctx.origin.z],
  );

  const legX = axle.wheel.width / 2 + LEG_CLEARANCE;
  const withX = (p: P, x: number): P => v(p.x + x, p.y, p.z);
  const visuals = [
    // triple clamp
    link('beam', ctx.chassis, withX(clamp, -legX), ctx.chassis, withX(clamp, legX)),
  ];
  const knuckleVisuals = (knuckle: RAPIER.RigidBody) => {
    const out: LinkVisual[] = [];
    const foot = W(ctx, wl);
    const sliderTop = onAxis(SLIDER_LENGTH);
    for (const x of [-legX, legX]) {
      // lower leg (tube) with the stanchion (piston rod) sliding out of it up to the clamp; spring above the tube
      out.push(link('damper', knuckle, withX(foot, x), ctx.chassis, withX(clamp, x)));
      out.push(link('spring', ctx.chassis, withX(clamp, x), knuckle, withX(sliderTop, x)));
    }
    // axle between the legs
    out.push(link('rod', knuckle, withX(foot, -legX), knuckle, withX(foot, legX)));
    return out;
  };

  return [
    finishCorner(ctx, axle, i, side, carrier, wl, rate, [carrier], visuals, '', {
      point: clamp,
      dir: up,
      marks: [clamp, bearing],
      knuckleVisuals,
    }),
  ];
};
