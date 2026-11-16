import { cornerId, partId } from '../../ids';
import { AX, add, armLimits, coilover, finishCorner, helper, lerp, link, revolute, springFor, springJoint, v, W, wheelLocal, wheelRate, leverRatio } from './common';
import type { AxleBuilder } from './types';

/** pivot sits this far ahead of the axle [m] */
const ARM_LENGTH = 0.6;
/** gap between tire side and swingarm leg [m] */
const LEG_CLEARANCE = 0.05;
/** shock mount: fraction of the arm length from the pivot, and height of the upper mount above it [m] */
const SHOCK_ALONG = 0.55;
const SHOCK_HEIGHT = 0.4;

/**
 * 12 · swingarm (motorcycle rear, single centered wheel)
 *   Chassis ─[Revolute X, ahead of the wheel]→ arm (= carrier); one mono-shock (spring joint) on the center plane
 * Two arm legs run either side of the wheel; the shock sits above the arm in front of the wheel.
 */
export const buildSwingArm: AxleBuilder = (ctx, axle, i) => {
  const side = 'C' as const;
  const id = cornerId(ctx.name, i, side);
  const wl = wheelLocal(axle, side);
  const wc = W(ctx, wl);
  const rate = wheelRate(ctx, axle, i, 1);
  const legX = axle.wheel.width / 2 + LEG_CLEARANCE;

  const pivot = add(wc, v(0, 0.04, -ARM_LENGTH));
  const arm = helper(ctx, axle, wc, partId(id, 'arm'));
  const j = revolute(ctx, ctx.chassis, arm, pivot, AX.X, [add(pivot, v(-legX, 0, 0)), add(pivot, v(legX, 0, 0))]);
  armLimits(j, AX.X, pivot, wc, axle.spring.travel);

  // mono-shock, vertical, on the arm between pivot and wheel
  const sp = lerp(pivot, wc, SHOCK_ALONG);
  const top = add(sp, v(0, SHOCK_HEIGHT, 0));
  springJoint(ctx, ctx.chassis, top, arm, sp, springFor(rate, leverRatio(AX.X, pivot, sp, wc)));

  const visuals = [
    link('beam', arm, add(pivot, v(-legX, 0, 0)), arm, add(wc, v(-legX, 0, 0))),
    link('beam', arm, add(pivot, v(legX, 0, 0)), arm, add(wc, v(legX, 0, 0))),
    link('rod', arm, add(pivot, v(-legX, 0, 0)), arm, add(pivot, v(legX, 0, 0))),
    link('rod', arm, add(wc, v(-legX, 0, 0)), arm, add(wc, v(legX, 0, 0))),
    ...coilover(ctx.chassis, top, arm, sp),
  ];
  return [finishCorner(ctx, axle, i, side, arm, wl, rate, [arm], visuals)];
};
