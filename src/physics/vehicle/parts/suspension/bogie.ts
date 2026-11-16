import { cornerId, partId } from '../../ids';
import { AX, add, coilover, finishCorner, helper, link, prismatic, prismaticSpring, revolute, sideSign, springFor, v, W, wheelLocal, wheelRate } from './common';
import { sidesOf, type AxleBuilder, type BuiltCorner } from './types';

/**
 * 0 · tandem bogie
 *   Chassis ─[Prismatic −Y, spring+damper]→ carrier ─[Revolute X, ±0.3 rad]→ rocker ─[Revolute X]→ 2 wheels
 *   basis for truck tandem and tracked running gear.
 */
export const buildBogie: AxleBuilder = (ctx, axle, i) => {
  const out: BuiltCorner[] = [];
  const spacing = axle.bogieSpacing ?? axle.wheel.radius * 2 + 0.2;
  for (const side of sidesOf(axle)) {
    const s = sideSign(side);
    const id = cornerId(ctx.name, i, side);
    const wc = W(ctx, wheelLocal(axle, side));
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length); // one spring carries both wheels
    const carrier = helper(ctx, axle, wc, partId(id, 'carrier'));
    const beam = helper(ctx, axle, wc, partId(id, 'walkingBeam'), 1);
    const pj = prismatic(ctx, ctx.chassis, carrier, wc, AX.DOWN);
    prismaticSpring(ctx, pj, springFor(rate, 1), axle.spring.travel);
    // The walking beam is drawn inboard of the wheels; put the hinge there too. Moving the anchor along the
    // hinge axis (X) does not change the dynamics, it only places the joint marker on the beam.
    const inb = -s * (axle.wheel.width / 2 + 0.12);
    const rj = revolute(ctx, carrier, beam, add(wc, v(inb, 0, 0)), AX.X);
    rj.setLimits(-0.3, 0.3);

    const top = add(wc, v(inb, 0.42, 0));
    const bot = add(wc, v(inb, 0, 0));
    const f = W(ctx, wheelLocal(axle, side, -spacing / 2));
    const r = W(ctx, wheelLocal(axle, side, spacing / 2));
    const visuals = [
      ...coilover(ctx.chassis, top, carrier, bot),
      link('beam', beam, add(f, v(inb, 0, 0)), beam, add(r, v(inb, 0, 0))),
      link('rod', beam, add(f, v(inb, 0, 0)), beam, f),
      link('rod', beam, add(r, v(inb, 0, 0)), beam, r),
    ];
    const perWheel = { kWheel: rate.kWheel / 2, load: rate.load / 2 };
    out.push(finishCorner(ctx, axle, i, side, beam, wheelLocal(axle, side, -spacing / 2), perWheel, [carrier, beam], visuals, 'f'));
    out.push(finishCorner(ctx, axle, i, side, beam, wheelLocal(axle, side, spacing / 2), perWheel, [], [], 'r'));
  }
  return out;
};
