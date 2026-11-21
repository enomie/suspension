import { cornerId, partId } from '../../ids';
import { STEER_DAMPING, STEER_STIFFNESS, add, coilover, finishCorner, helper, link, prismatic, prismaticSpring, revolute, springFor, v, W, wheelLocal, wheelRate, type P } from './common';
import type { AxleBuilder } from './types';

/** defaults: 26° steering-head angle, 100 mm trail */
const DEFAULT_RAKE = 0.45;
const DEFAULT_TRAIL = 0.1;
/** fork sizes per wheel radius (0.31 m wheel → clamp 0.55 m, slider 0.3 m, bearing 0.45 m), so the clamp always sits above the tire:
 *  distance from the axle line up the steering axis to the triple clamp, length of the lower leg (slider) above the axle line,
 *  distance from the axle line to the lower steering bearing */
const CLAMP_HEIGHT_PER_RADIUS = 1.77;
const SLIDER_LENGTH_PER_RADIUS = 0.97;
const LOWER_BEARING_PER_RADIUS = 1.45;
/** gap between tire side and fork leg axis: grows with the wheel, but legs stay close to a small tire [m] */
const legClearance = (radius: number) => Math.max(0.04, radius * 0.17);

/**
 * 11 · telescopic fork (motorcycle front, single centered wheel)
 *   Chassis ─[Revolute about the rake axis, steering]→ yoke (triple clamp + stanchions)
 *   yoke ─[Prismatic along the same axis, motor = spring+damper]→ slider (lower legs + axle) ─[Revolute X]→ wheel
 *
 * The yoke steers, so clamp, stanchions, sliders and wheel all turn as one unit. The axis is tilted back by
 * `fork.rake` and the wheel center sits `offset` in front of it, so that the axis meets the ground `trail` ahead of
 * the contact patch:  trail = (R·sin ε − offset) / cos ε   →   offset = R·sin ε − trail·cos ε
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
  const r = axle.wheel.radius;
  const clamp = onAxis(CLAMP_HEIGHT_PER_RADIUS * r);
  const bearing = onAxis(LOWER_BEARING_PER_RADIUS * r);

  // steering: chassis → yoke about the raked axis (markers and mounts sit on the chassis)
  const yoke = helper(ctx, axle, wc, partId(id, 'yoke'));
  const steer = revolute(ctx, ctx.chassis, yoke, clamp, up, [clamp, bearing], ctx.chassis);
  steer.setLimits(-axle.steer!.maxAngle, axle.steer!.maxAngle);
  steer.configureMotorModel(ctx.R.MotorModel.ForceBased);
  steer.configureMotorPosition(0, STEER_STIFFNESS, STEER_DAMPING);

  // suspension: yoke → slider along the same axis. Wheel moves along the (tilted) axis, so vertical rate k_w
  // becomes k_w·cos²ε along it (motion ratio 1/cos ε)
  const slider = helper(ctx, axle, wc, partId(id, 'slider'));
  const slide = prismatic(ctx, yoke, slider, wc, down);
  prismaticSpring(ctx, slide, springFor(rate, 1 / cos), [axle.spring.travel[0] / cos, axle.spring.travel[1] / cos]);

  // everything below is attached to the yoke (stanchions, clamp) or the slider (lower legs, axle): all steer together
  const legX = axle.wheel.width / 2 + legClearance(axle.wheel.radius);
  const withX = (p: P, x: number): P => v(p.x + x, p.y, p.z);
  const axleCenter = W(ctx, wl); // wheel center
  const legFoot = onAxis(0); // lower end of the leg on the steering axis (leg runs parallel to the spring)
  const sliderTop = onAxis(SLIDER_LENGTH_PER_RADIUS * r);
  const visuals = [link('beam', yoke, withX(clamp, -legX), yoke, withX(clamp, legX))];
  for (const x of [-legX, legX]) {
    // lower leg (rod) parallel to the steering axis, then spring + damper coaxial up to the clamp
    visuals.push(link('rod', slider, withX(legFoot, x), slider, withX(sliderTop, x)));
    visuals.push(...coilover(slider, withX(sliderTop, x), yoke, withX(clamp, x)));
    // fork offset: short bracket from the leg foot (on the axis) forward to the axle
    visuals.push(link('rod', slider, withX(legFoot, x), slider, withX(axleCenter, x)));
  }
  // axle between the legs, through the wheel center
  visuals.push(link('rod', slider, withX(axleCenter, -legX), slider, withX(axleCenter, legX)));

  // the steering joint lives on the yoke, the wheel on the slider: finishCorner builds the spin joint on the slider
  const corner = finishCorner(ctx, { ...axle, steer: undefined }, i, side, slider, wl, rate, [yoke, slider], visuals);
  corner.axle = axle;
  corner.joints.steer = steer;
  return [corner];
};
