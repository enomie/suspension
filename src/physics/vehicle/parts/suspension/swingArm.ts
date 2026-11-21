import { cornerId, partId } from '../../ids';
import { AX, add, type P, armLimits, coilover, finishCorner, helper, lerp, link, revolute, springFor, springJoint, v, W, wheelLocal, wheelRate, leverRatio } from './common';
import type { AxleBuilder } from './types';

/** default: the pivot sits about two wheel radii ahead of the axle, at least this far [m] (`AxleSpec.armLength` overrides) */
const MIN_ARM_LENGTH = 0.5;
/** gap between tire side and swingarm leg [m] */
const LEG_CLEARANCE = 0.05;
/** the lower shock mount stays this far ahead of the tire's front edge, so the spring never pokes into the wheel [m] */
const SHOCK_TIRE_CLEARANCE = 0.1;
/** height of the upper shock mount above the lower one, in wheel radii (0.31 m wheel → 0.39 m) */
const SHOCK_HEIGHT_PER_RADIUS = 1.25;

/**
 * 12 · swingarm (motorcycle rear, single centered wheel)
 *   Chassis ─[Revolute X, ahead of the wheel]→ arm (= carrier); one mono-shock (spring joint) on the center plane
 * Two arm legs run either side of the wheel, or one leg on one side (`AxleSpec.swingArmSide`: single-sided arm; the
 * physics is the same rigid arm on the same hinge, only the drawing differs). The shock sits above the arm in front of the wheel.
 */
export const buildSwingArm: AxleBuilder = (ctx, axle, i) => {
  const side = 'C' as const;
  const id = cornerId(ctx.name, i, side);
  const wl = wheelLocal(axle, side);
  const wc = W(ctx, wl);
  const rate = wheelRate(ctx, axle, i, 1);
  const legX = axle.wheel.width / 2 + LEG_CLEARANCE;
  const armLength = axle.armLength ?? Math.max(MIN_ARM_LENGTH, axle.wheel.radius * 2);

  const pivot = add(wc, v(0, 0.04, -armLength));
  const arm = helper(ctx, axle, wc, partId(id, 'arm'));
  const j = revolute(ctx, ctx.chassis, arm, pivot, AX.X, [add(pivot, v(-legX, 0, 0)), add(pivot, v(legX, 0, 0))]);
  armLimits(j, AX.X, pivot, wc, axle.spring.travel);

  // mono-shock, vertical, on the arm in front of the wheel (clear of the tire)
  const along = Math.min(0.7, Math.max(0.15, 1 - (axle.wheel.radius + SHOCK_TIRE_CLEARANCE) / armLength));
  const sp = lerp(pivot, wc, along);
  const top = add(sp, v(0, SHOCK_HEIGHT_PER_RADIUS * axle.wheel.radius, 0));
  springJoint(ctx, ctx.chassis, top, arm, sp, springFor(rate, leverRatio(AX.X, pivot, sp, wc)));

  const at = (p: P, x: number): P => add(p, v(x, 0, 0));
  // pivot tube across the full width (the bearing), then one leg per side, or one leg on the chosen side only
  const visuals = [link('rod', arm, at(pivot, -legX), arm, at(pivot, legX))];
  const single = axle.swingArmSide;
  if (single) {
    // single-sided: one leg on that side, an axle stub to the wheel center and a bracket to the shock on the center plane
    const x = single === 'right' ? legX : -legX;
    visuals.push(link('beam', arm, at(pivot, x), arm, at(wc, x)), link('rod', arm, at(wc, x), arm, wc), link('rod', arm, at(sp, x), arm, sp));
  } else {
    visuals.push(
      link('beam', arm, at(pivot, -legX), arm, at(wc, -legX)),
      link('beam', arm, at(pivot, legX), arm, at(wc, legX)),
      link('rod', arm, at(wc, -legX), arm, at(wc, legX)),
    );
  }
  visuals.push(...coilover(ctx.chassis, top, arm, sp));
  return [finishCorner(ctx, axle, i, side, arm, wl, rate, [arm], visuals)];
};
