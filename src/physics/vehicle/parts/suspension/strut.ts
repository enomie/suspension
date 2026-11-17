import { partId, cornerId } from '../../ids';
import { AX, add, coilover, finishCorner, helper, prismatic, prismaticSpring, sideSign, springFor, v, W, wheelLocal, wheelRate } from './common';
import { sidesOf, type AxleBuilder } from './types';

/** gap between the two tires of a twin pair [m] */
const TWIN_GAP = 0.04;

/**
 * 1 · slider strut
 *   Chassis ─[Prismatic −Y, motor = spring+damper, limits = travel]→ strut (= carrier)
 * `twin` (centered axle only): the one strut carries two wheels side by side (twin nose wheel).
 */
export const buildStrut: AxleBuilder = (ctx, axle, i) =>
  sidesOf(axle).flatMap((side) => {
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
    if (!(axle.twin && side === 'C')) return [finishCorner(ctx, axle, i, side, strut, wl, rate, [strut], visuals)];

    // twin: one corner per wheel, the spring carries both (like the bogie)
    const dx = axle.wheel.width / 2 + TWIN_GAP / 2;
    const perWheel = { kWheel: rate.kWheel / 2, load: rate.load / 2 };
    visuals.push({ kind: 'rod', a: { body: strut, local: [-dx, 0, 0] }, b: { body: strut, local: [dx, 0, 0] } });
    return [
      finishCorner(ctx, axle, i, side, strut, add(wl, v(-dx, 0, 0)), perWheel, [strut], visuals, 'l'),
      finishCorner(ctx, axle, i, side, strut, add(wl, v(dx, 0, 0)), perWheel, [], [], 'r'),
    ];
  });
