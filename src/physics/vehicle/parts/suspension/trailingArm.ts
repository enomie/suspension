import { cornerId, partId } from '../../ids';
import { add, armLimits, coilover, finishCorner, helper, leverRatio, lerp, link, norm, revolute, sideSign, springFor, springJoint, v, W, wheelLocal, wheelRate, type P } from './common';
import { sidesOf, type AxleBuilder } from './types';
import type { AxleSpec } from '../../types';
import type { BuildContext } from '../context';

const ARM_LENGTH = 0.55;

/** shared builder for trailing and semi-trailing arms (yaw = swing axis heading). */
function buildArm(ctx: BuildContext, axle: AxleSpec, i: number, yaw: number) {
  return sidesOf(axle).map((side) => {
    const s = sideSign(side);
    const id = cornerId(ctx.name, i, side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length);
    const inb = -s * (axle.wheel.width / 2 + 0.15);
    const px = yaw ? -s * 0.4 : inb;
    const pivot = add(wc, v(px, 0.04, -ARM_LENGTH));
    const axis: P = norm(v(Math.cos(yaw), 0, -s * Math.sin(yaw)));

    const arm = helper(ctx, axle, wc, partId(id, 'arm'));
    const j = revolute(ctx, ctx.chassis, arm, pivot, axis);
    armLimits(j, axis, pivot, wc, axle.spring.travel);

    // spring point inboard beside wheel, 85% toward wheel
    const sp = add(lerp(pivot, wc, 0.85), v(inb - px * 0.15, 0, 0));
    const top = add(sp, v(0, 0.45, 0));
    springJoint(ctx, ctx.chassis, top, arm, sp, springFor(rate, leverRatio(axis, pivot, sp, wc)));

    const knee = add(wc, v(inb, 0, 0));
    const visuals = [
      link('beam', arm, pivot, arm, knee),
      link('rod', arm, knee, arm, wc),
      ...coilover(ctx.chassis, top, arm, sp),
    ];
    return finishCorner(ctx, axle, i, side, arm, wl, rate, [arm], visuals);
  });
}

/**
 * 4 · trailing arm (motorcycle: swingarm)
 *   Chassis ─[Revolute X, ahead of wheel]→ arm (= carrier); spring chassis ↔ arm
 */
export const buildTrailingArm: AxleBuilder = (ctx, axle, i) => buildArm(ctx, axle, i, 0);

/** 5 · semi-trailing arm — swing axis yawed 20° → camber + toe change on jounce */
export const buildSemiTrailingArm: AxleBuilder = (ctx, axle, i) => buildArm(ctx, axle, i, 0.35);
