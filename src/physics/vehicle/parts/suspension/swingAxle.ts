import { cornerId, partId } from '../../ids';
import { AX, add, armLimits, coilover, finishCorner, helper, leverRatio, lerp, link, revolute, sideSign, springFor, springJoint, v, W, wheelLocal, wheelRate } from './common';
import { sidesOf, type AxleBuilder } from './types';

/**
 * 6 · Pendelachse
 *   Chassis ─[Revolute Z, nahe Fahrzeugmitte]→ Halbachse (= Radträger); Feder Chassis ↔ Halbachse
 *   Starke Sturzänderung beim Einfedern (typisch: Aufstützeffekt).
 */
export const buildSwingAxle: AxleBuilder = (ctx, axle, i) =>
  sidesOf(axle).map((side) => {
    const s = sideSign(side);
    const id = cornerId(ctx.name, i, side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length);
    const pivot = W(ctx, v(s * 0.08, axle.y, axle.z));

    const half = helper(ctx, axle, wc, partId(id, 'halfAxle'));
    const j = revolute(ctx, ctx.chassis, half, pivot, AX.Z);
    armLimits(j, AX.Z, pivot, wc, axle.spring.travel);

    const sp = lerp(pivot, wc, 0.7);
    const top = add(sp, v(0, 0.45, 0));
    springJoint(ctx, ctx.chassis, top, half, sp, springFor(rate, leverRatio(AX.Z, pivot, sp, wc)));

    const visuals = [link('beam', half, pivot, half, wc), ...coilover(ctx.chassis, top, half, sp)];
    return finishCorner(ctx, axle, i, side, half, wl, rate, [half], visuals);
  });
