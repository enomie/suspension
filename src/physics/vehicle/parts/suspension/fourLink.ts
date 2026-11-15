import { partId } from '../../ids';
import { add, coilover, finishCorner, helper, len, link, rope, spherical, springFor, springJoint, sub, v, W, wheelLocal, wheelRate, type P } from './common';
import type { AxleBuilder } from './types';

/** [chassis end, axle end] relative to the axle centre; x for the right side (mirrored for the left) */
const LINKS: [P, P][] = [
  [v(0.4, -0.02, -1.0), v(0.4, -0.12, 0)], // lower trailing arm (long, nearly horizontal)
  [v(0.12, 0.14, -0.8), v(0.32, 0.2, 0)], //  upper link, triangulated: locates the axle laterally
];

/** Length of the bump rope (long, so it acts almost vertically) */
const BUMP_ROPE = 2;

/**
 * 4-link solid axle (trophy truck rear)
 *   per link: chassis ─[Spherical]→ link ─[Spherical]→ axle   (4 distance constraints → vertical travel + roll remain)
 *   2 coilovers chassis ↔ axle; ropes = droop / bump stops. Both wheels sit on the one axle body.
 */
export const buildFourLink: AxleBuilder = (ctx, axle, i) => {
  const center = W(ctx, v(0, axle.y, axle.z));
  const id = `${ctx.name}.a${i}`;
  const rate = wheelRate(ctx, axle, i, 2);
  const beam = helper(ctx, axle, center, partId(id, 'axleBeam'), 2);
  const bodies = [beam];
  const visuals = [];

  for (const [s, side] of [[-1, 'L'], [1, 'R']] as const) {
    const m = (p: P) => add(center, v(p.x * s, p.y, p.z));
    LINKS.forEach(([inner, outer], k) => {
      const a = m(inner);
      const b = m(outer);
      const rod = helper(ctx, axle, v((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), partId(id, `${side}.link${k}`), 0.2);
      spherical(ctx, ctx.chassis, rod, a);
      spherical(ctx, rod, beam, b);
      bodies.push(rod);
      visuals.push(link('rod', rod, a, rod, b));
    });

    const sp = add(center, v(s * (axle.track / 2 - axle.wheel.width / 2 - 0.25), 0, 0));
    const top = add(sp, v(0, axle.spring.length ?? 0.45, 0));
    springJoint(ctx, ctx.chassis, top, beam, sp, springFor(rate, 1));
    // droop stop: max distance to the spring dome; bump stop: max distance to a point far below
    rope(ctx, ctx.chassis, top, beam, sp, len(sub(sp, top)) + axle.spring.travel[1]);
    rope(ctx, ctx.chassis, add(sp, v(0, -BUMP_ROPE, 0)), beam, sp, BUMP_ROPE - axle.spring.travel[0]);
    visuals.push(...coilover(ctx.chassis, top, beam, sp));
  }
  visuals.push(link('beam', beam, W(ctx, wheelLocal(axle, 'L')), beam, W(ctx, wheelLocal(axle, 'R'))));

  return [
    finishCorner(ctx, axle, i, 'L', beam, wheelLocal(axle, 'L'), rate, bodies, visuals),
    finishCorner(ctx, axle, i, 'R', beam, wheelLocal(axle, 'R'), rate, [], []),
  ];
};
