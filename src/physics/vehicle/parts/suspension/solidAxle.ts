import { partId } from '../../ids';
import { AX, add, coilover, finishCorner, helper, link, prismatic, revolute, springFor, springJoint, v, W, wheelLocal, wheelRate } from './common';
import type { AxleBuilder } from './types';

/**
 * 7 · solid axle
 *   Chassis ─[Prismatic −Y, limits]→ guide ─[Revolute Z, panhard]→ axle body (= carrier of both wheels)
 *   2 springs chassis ↔ axle body. steerable via knuckle per wheel (truck front axle).
 */
export const buildSolidAxle: AxleBuilder = (ctx, axle, i) => {
  const center = W(ctx, v(0, axle.y, axle.z));
  const id = `${ctx.name}.a${i}`;
  const rate = wheelRate(ctx, axle, i, 2);
  const guide = helper(ctx, axle, center, partId(id, 'guide'), 0.5);
  const beam = helper(ctx, axle, center, partId(id, 'axleBeam'), 2);
  const pj = prismatic(ctx, ctx.chassis, guide, center, AX.DOWN);
  pj.setLimits(axle.spring.travel[0], axle.spring.travel[1]);
  const rj = revolute(ctx, guide, beam, center, AX.Z);
  rj.setLimits(-0.2, 0.2);

  const visuals = [];
  const spX = axle.track / 2 - axle.wheel.width / 2 - 0.15;
  for (const s of [-1, 1]) {
    const sp = add(center, v(s * spX, 0, 0));
    const top = add(sp, v(0, 0.45, 0));
    springJoint(ctx, ctx.chassis, top, beam, sp, springFor(rate, 1));
    visuals.push(...coilover(ctx.chassis, top, beam, sp));
  }
  const l = W(ctx, wheelLocal(axle, 'L'));
  const r = W(ctx, wheelLocal(axle, 'R'));
  visuals.push(link('beam', beam, l, beam, r));

  return [
    finishCorner(ctx, axle, i, 'L', beam, wheelLocal(axle, 'L'), rate, [guide, beam], visuals),
    finishCorner(ctx, axle, i, 'R', beam, wheelLocal(axle, 'R'), rate, [], []),
  ];
};
