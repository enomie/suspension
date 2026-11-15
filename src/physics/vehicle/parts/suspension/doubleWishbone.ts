import { cornerId, partId } from '../../ids';
import { AX, add, armLimits, coilover, finishCorner, helper, leverRatio, lerp, link, revolute, sideSign, spherical, springFor, springJoint, v, W, wheelLocal, wheelRate } from './common';
import { sidesOf, type AxleBuilder } from './types';

/**
 * 2 · Doppelquerlenker
 *   Chassis ─[Revolute Z]→ unterer Lenker ─[Revolute Z]→ Radträger
 *   Chassis ─[Revolute Z]→ oberer Lenker (kürzer → Sturzgewinn) ─[Spherical]→ Radträger
 *   Feder: Spring-Joint Chassis ↔ unterer Lenker
 */
export const buildDoubleWishbone: AxleBuilder = (ctx, axle, i) =>
  sidesOf(axle).map((side) => {
    const s = sideSign(side);
    const id = cornerId(ctx.name, i, side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length);
    const lowIn = add(wc, v(-s * 0.55, -0.12, 0));
    const lowOut = add(wc, v(-s * 0.1, -0.12, 0));
    const upIn = add(wc, v(-s * 0.42, 0.2, 0));
    const upOut = add(wc, v(-s * 0.14, 0.2, 0));

    const lower = helper(ctx, axle, lerp(lowIn, lowOut, 0.5), partId(id, 'lowerArm'));
    const upper = helper(ctx, axle, lerp(upIn, upOut, 0.5), partId(id, 'upperArm'));
    const upright = helper(ctx, axle, wc, partId(id, 'upright'));

    const jl = revolute(ctx, ctx.chassis, lower, lowIn, AX.Z);
    revolute(ctx, ctx.chassis, upper, upIn, AX.Z);
    revolute(ctx, lower, upright, lowOut, AX.Z);
    spherical(ctx, upper, upright, upOut);
    armLimits(jl, AX.Z, lowIn, wc, axle.spring.travel);

    // Feder-Dämpfer-Einheit 12 cm in Fahrtrichtung versetzt, damit sie am oberen Lenker vorbeiläuft statt hindurchzugehen.
    // Hebelverhältnis und Ruhelänge bleiben gleich (Achse Z, beide Enden um dasselbe z verschoben).
    const sp = add(lerp(lowIn, lowOut, 0.75), v(0, 0, 0.12));
    const top = add(sp, v(0, 0.45, 0));
    springJoint(ctx, ctx.chassis, top, lower, sp, springFor(rate, leverRatio(AX.Z, lowIn, sp, wc)));

    const visuals = [
      link('rod', lower, lowIn, lower, lowOut),
      link('rod', upper, upIn, upper, upOut),
      link('beam', upright, lowOut, upright, upOut),
      ...coilover(ctx.chassis, top, lower, sp),
    ];
    return finishCorner(ctx, axle, i, side, upright, wl, rate, [lower, upper, upright], visuals);
  });
