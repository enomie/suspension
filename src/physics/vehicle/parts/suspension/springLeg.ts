import { cornerId, partId } from '../../ids';
import { add, finishCorner, helper, link, norm, prismatic, prismaticSpring, sideSign, springFor, sub, v, W, wheelLocal, wheelRate } from './common';
import type { AxleBuilder } from './types';

/** the leg root sits this far inboard of the wheel and this far above it [m]: ~35° from vertical */
const ROOT_INBOARD = 0.5;
const ROOT_HEIGHT = 0.7;
/** the root stays at least this far outside the centre line [m] */
const MIN_ROOT_X = 0.05;

/**
 * 13 · spring leg (light-aircraft main gear, non-steering)
 *   Chassis ─[Prismatic along the leg, motor = spring+damper, limits = travel]→ leg (= carrier) ─[Revolute X]→ wheel
 * The leg runs from a root near the centre line, up in the fuselage, outward and down to the wheel. A cantilever
 * spring-steel leg is modelled as a slider along its own axis: the wheel moves along the (tilted) leg, so the
 * vertical rate stays k_w (spring rate k_w·cos²θ along the axis, motion ratio 1/cos θ), like the telescopic fork.
 */
export const buildSpringLeg: AxleBuilder = (ctx, axle, i) =>
  (['L', 'R'] as const).map((side) => {
    const s = sideSign(side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, 2);
    const inboard = Math.min(ROOT_INBOARD, axle.track / 2 - MIN_ROOT_X);
    const root = add(wc, v(-s * inboard, ROOT_HEIGHT, 0));
    const axis = norm(sub(wc, root)); // points down and outward: extension
    const cos = Math.abs(axis.y);

    const leg = helper(ctx, axle, wc, partId(cornerId(ctx.name, i, side), 'leg'));
    const j = prismatic(ctx, ctx.chassis, leg, wc, axis);
    prismaticSpring(ctx, j, springFor(rate, 1 / cos), [axle.spring.travel[0] / cos, axle.spring.travel[1] / cos]);

    // a plain leg from the root on the chassis to the wheel hub: no coil spring, the leg itself is the spring
    return finishCorner(ctx, axle, i, side, leg, wl, rate, [leg], [link('beam', ctx.chassis, root, leg, wc)]);
  });
