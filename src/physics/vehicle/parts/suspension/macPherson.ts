import { cornerId, partId } from '../../ids';
import { AX, add, coilover, finishCorner, helper, lerp, link, norm, prismatic, prismaticSpring, revolute, sideSign, spherical, springFor, sub, v, W, wheelLocal, wheelRate, type P } from './common';
import { sidesOf, type AxleBuilder } from './types';

/** extra solver iterations for MacPherson bodies */
const EXTRA_ITERATIONS = 16;
/** half spacing of the two control-arm bushings (front/rear) [m] */
const A_ARM_HALF_SPAN = 0.25;

const cross2 = (p: P, f: P) => p.x * f.y - p.y * f.x;

/**
 * strut/wheel motion ratio from statics in lateral plane (virtual work: MR = N / S).
 * carrier forces: wheel load N (contact), arm H (two-link bar → along arm),
 * at strut top spring force S (along strut) + lateral t. moments about top → H, then ΣF → S.
 */
function strutRatio(top: P, axis: P, lowIn: P, lowOut: P, contact: P): number {
  const h = norm(sub(lowOut, lowIn));
  const n = v(-axis.y, axis.x, 0);
  const N = 1;
  const H = -cross2(sub(contact, top), v(0, N, 0)) / cross2(sub(lowOut, top), h);
  // S·a + t·n = −(H·h + N·ŷ)
  const rx = -H * h.x;
  const ry = -(N + H * h.y);
  const det = axis.x * n.y - axis.y * n.x;
  const S = (rx * n.y - ry * n.x) / det;
  return N / S;
}

/**
 * 3 · McPherson
 *   Chassis ─[Spherical, top mount]→ dome ─[Prismatic inclined, motor = spring+damper]→ carrier
 *   Chassis ─[Revolute Z]→ control arm ─[Revolute Z]→ carrier
 */
export const buildMacPherson: AxleBuilder = (ctx, axle, i) =>
  sidesOf(axle).map((side) => {
    const s = sideSign(side);
    const id = cornerId(ctx.name, i, side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length);

    const top = add(wc, v(-s * 0.24, 0.55, 0));
    // foot 17 cm beside wheel center: spring (7.5 cm seat radius) clears knuckle and hub
    const strutBot = add(wc, v(-s * 0.17, 0.05, 0));
    // arm plane 5 cm below wheel center (was 15): otherwise bushings hung 30 cm below ladder frame
    const lowIn = add(wc, v(-s * 0.5, -0.05, 0));
    const lowOut = add(wc, v(-s * 0.08, -0.05, 0));
    const axis = norm(sub(strutBot, top)); // points down = jounce

    const dome = helper(ctx, axle, top, partId(id, 'strutTop'), 0.3);
    const upright = helper(ctx, axle, wc, partId(id, 'upright'));
    const lower = helper(ctx, axle, lerp(lowIn, lowOut, 0.5), partId(id, 'lowerArm'));

    // closed chain (dome–strut–arm) converges slowly → extra iterations only here
    for (const b of [dome, upright, lower]) b.setAdditionalSolverIterations(EXTRA_ITERATIONS);
    spherical(ctx, ctx.chassis, dome, top);
    const pj = prismatic(ctx, dome, upright, top, axis);
    const mr = strutRatio(top, axis, lowIn, lowOut, v(wc.x, wc.y - axle.wheel.radius, wc.z));
    const ax = Math.abs(axis.y);
    prismaticSpring(ctx, pj, springFor(rate, mr), [axle.spring.travel[0] * ax, axle.spring.travel[1] * ax]);
    // A-arm: the hinge axis (Z) runs through both bushings, so show a marker at each of them
    revolute(ctx, ctx.chassis, lower, lowIn, AX.Z, [add(lowIn, v(0, 0, -A_ARM_HALF_SPAN)), add(lowIn, v(0, 0, A_ARM_HALF_SPAN))]);
    revolute(ctx, lower, upright, lowOut, AX.Z);

    const visuals = [
      // foot → dome order: damper tube on carrier bottom, piston rod exits at top
      ...coilover(upright, strutBot, dome, top),
      // A-arm (visual only): two bushings front/rear on the hinge axis (Z) through lowIn, one ball joint outside
      link('rod', lower, add(lowIn, v(0, 0, -A_ARM_HALF_SPAN)), lower, lowOut),
      link('rod', lower, add(lowIn, v(0, 0, A_ARM_HALF_SPAN)), lower, lowOut),
      link('beam', upright, lowOut, upright, strutBot),
    ];
    return finishCorner(ctx, axle, i, side, upright, wl, rate, [dome, upright, lower], visuals);
  });
