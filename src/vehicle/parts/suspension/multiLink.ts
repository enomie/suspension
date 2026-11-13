import { cornerId, partId } from '../../ids';
import { add, coilover, finishCorner, helper, len, lerp, link, rope, sideSign, spherical, springFor, springJoint, sub, v, W, wheelLocal, wheelRate, type P } from './common';
import { sidesOf, type AxleBuilder } from './types';

/** [innen (Chassis), außen (Radträger)] relativ zur Radmitte, x für rechte Seite (links gespiegelt) */
const LINKS: [P, P][] = [
  [v(-0.45, 0.22, -0.25), v(-0.12, 0.2, -0.08)], // oben vorn
  [v(-0.45, 0.22, 0.25), v(-0.12, 0.2, 0.08)], //  oben hinten
  [v(-0.55, -0.13, -0.3), v(-0.1, -0.15, -0.1)], // unten vorn
  [v(-0.55, -0.13, 0.3), v(-0.1, -0.15, 0.1)], //  unten hinten
  [v(-0.5, 0, 0.22), v(-0.1, 0, 0.15)], //          Spurstange
];

/** Länge des Einfeder-Seils (lang → nahezu senkrechte Wirkung) */
const BUMP_ROPE = 2;

/**
 * 9 · Mehrlenker (5 Stäbe)
 *   je Stab: Chassis ─[Spherical]→ Stab ─[Spherical]→ Radträger  (5 Abstandsbindungen → 1 Freiheitsgrad)
 *   Feder Chassis ↔ Radträger, Seil = Ausfeder-Anschlag.
 */
export const buildMultiLink: AxleBuilder = (ctx, axle, i) =>
  sidesOf(axle).map((side) => {
    const s = sideSign(side) || 1;
    const id = cornerId(ctx.name, i, side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length);
    const m = (p: P) => add(wc, v(p.x * s, p.y, p.z));

    const upright = helper(ctx, axle, wc, partId(id, 'upright'));
    const bodies = [upright];
    const visuals = [];
    LINKS.forEach(([inner, outer], k) => {
      const a = m(inner);
      const b = m(outer);
      const rod = helper(ctx, axle, lerp(a, b, 0.5), partId(id, `link${k}`), 0.2);
      spherical(ctx, ctx.chassis, rod, a);
      spherical(ctx, rod, upright, b);
      bodies.push(rod);
      visuals.push(link('rod', rod, a, rod, b));
    });

    const sp = m(v(-0.2, -0.1, 0));
    const top = add(sp, v(0, 0.5, 0));
    springJoint(ctx, ctx.chassis, top, upright, sp, springFor(rate, 1));
    // Anschläge per Seil (= Maximalabstand): Ausfedern zum Federdom, Einfedern zu einem Punkt 2 m darunter
    rope(ctx, ctx.chassis, top, upright, sp, len(sub(sp, top)) + axle.spring.travel[1]);
    const below = add(sp, v(0, -BUMP_ROPE, 0));
    rope(ctx, ctx.chassis, below, upright, sp, BUMP_ROPE - axle.spring.travel[0]);
    visuals.push(...coilover(ctx.chassis, top, upright, sp));
    visuals.push(link('beam', upright, m(v(-0.12, 0.2, 0)), upright, m(v(-0.1, -0.15, 0))));
    return finishCorner(ctx, axle, i, side, upright, wl, rate, bodies, visuals);
  });
