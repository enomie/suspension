import { partId, cornerId } from '../../ids';
import { AX, add, coilover, finishCorner, helper, prismatic, prismaticSpring, sideSign, springFor, v, W, wheelLocal, wheelRate } from './common';
import { sidesOf, type AxleBuilder } from './types';

/**
 * 1 · Schiebe-Federbein
 *   Chassis ─[Prismatic −Y, Motor = Feder+Dämpfer, Limits = Federweg]→ Strut (= Radträger)
 */
export const buildStrut: AxleBuilder = (ctx, axle, i) =>
  sidesOf(axle).map((side) => {
    const s = sideSign(side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length);
    const strut = helper(ctx, axle, wc, partId(cornerId(ctx.name, i, side), 'strut'));
    const j = prismatic(ctx, ctx.chassis, strut, wc, AX.DOWN);
    prismaticSpring(ctx, j, springFor(rate, 1), axle.spring.travel);

    const inb = -s * (axle.wheel.width / 2 + 0.12);
    const top = add(wc, v(inb, 0.42, 0));
    const bot = add(wc, v(inb, 0, 0));
    const visuals = [...coilover(ctx.chassis, top, strut, bot)];
    visuals.push({ kind: 'rod', a: { body: strut, local: [inb, 0, 0] }, b: { body: strut, local: [0, 0, 0] } });
    return finishCorner(ctx, axle, i, side, strut, wl, rate, [strut], visuals);
  });
