import { cornerId, partId } from '../../ids';
import { AX, add, coilover, finishCorner, helper, lerp, link, norm, prismatic, prismaticSpring, revolute, sideSign, spherical, springFor, sub, v, W, wheelLocal, wheelRate, type P } from './common';
import { sidesOf, type AxleBuilder } from './types';

/** zusätzliche Solver-Iterationen für die McPherson-Körper */
const EXTRA_ITERATIONS = 16;
/** halber Abstand der beiden Querlenker-Lager (vorn/hinten) [m] */
const A_ARM_HALF_SPAN = 0.25;

const cross2 = (p: P, f: P) => p.x * f.y - p.y * f.x;

/**
 * Übersetzung Federbein/Rad aus der Statik in der Querebene (virtuelle Arbeit: MR = N / S).
 * Radträger-Kräfte: Radlast N (Aufstandspunkt), Querlenker H (Zweigelenkstab → entlang Lenker),
 * am Domlager Federkraft S (entlang Federbein) + Querkraft t. Momente um das Domlager → H, dann ΣF → S.
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
 *   Chassis ─[Spherical, Domlager]→ Dom ─[Prismatic schräg, Motor = Feder+Dämpfer]→ Radträger
 *   Chassis ─[Revolute Z]→ Querlenker ─[Revolute Z]→ Radträger
 */
export const buildMacPherson: AxleBuilder = (ctx, axle, i) =>
  sidesOf(axle).map((side) => {
    const s = sideSign(side);
    const id = cornerId(ctx.name, i, side);
    const wl = wheelLocal(axle, side);
    const wc = W(ctx, wl);
    const rate = wheelRate(ctx, axle, i, sidesOf(axle).length);

    const top = add(wc, v(-s * 0.24, 0.55, 0));
    // Fuß 17 cm neben der Radmitte: Feder (Teller-Radius 7,5 cm) bleibt frei von Achsschenkel und Nabe
    const strutBot = add(wc, v(-s * 0.17, 0.05, 0));
    // Lenker-Ebene 5 cm unter Radmitte (vorher 15): die Lager hingen sonst 30 cm unter dem Leiterrahmen
    const lowIn = add(wc, v(-s * 0.5, -0.05, 0));
    const lowOut = add(wc, v(-s * 0.08, -0.05, 0));
    const axis = norm(sub(strutBot, top)); // zeigt nach unten = Ausfedern

    const dome = helper(ctx, axle, top, partId(id, 'strutTop'), 0.3);
    const upright = helper(ctx, axle, wc, partId(id, 'upright'));
    const lower = helper(ctx, axle, lerp(lowIn, lowOut, 0.5), partId(id, 'lowerArm'));

    // geschlossene Kette (Dom–Federbein–Querlenker) konvergiert langsam → mehr Iterationen nur hier
    for (const b of [dome, upright, lower]) b.setAdditionalSolverIterations(EXTRA_ITERATIONS);
    spherical(ctx, ctx.chassis, dome, top);
    const pj = prismatic(ctx, dome, upright, top, axis);
    const mr = strutRatio(top, axis, lowIn, lowOut, v(wc.x, wc.y - axle.wheel.radius, wc.z));
    const ax = Math.abs(axis.y);
    prismaticSpring(ctx, pj, springFor(rate, mr), [axle.spring.travel[0] * ax, axle.spring.travel[1] * ax]);
    revolute(ctx, ctx.chassis, lower, lowIn, AX.Z);
    revolute(ctx, lower, upright, lowOut, AX.Z);

    const visuals = [
      // Reihenfolge Fuß → Dom: Dämpferrohr sitzt unten am Radträger, Kolbenstange kommt oben heraus
      ...coilover(upright, strutBot, dome, top),
      // A-Lenker (nur Optik): zwei Lager vorn/hinten auf der Drehachse (Z) durch lowIn, ein Kugelgelenk außen.
      // Die Null-Länge-Stäbe Chassis→Lager erzeugen die Rahmen-Konsolen (`mounts`), sonst hinge der Lenker frei.
      link('rod', lower, add(lowIn, v(0, 0, -A_ARM_HALF_SPAN)), lower, lowOut),
      link('rod', lower, add(lowIn, v(0, 0, A_ARM_HALF_SPAN)), lower, lowOut),
      link('rod', ctx.chassis, add(lowIn, v(0, 0, -A_ARM_HALF_SPAN)), lower, add(lowIn, v(0, 0, -A_ARM_HALF_SPAN))),
      link('rod', ctx.chassis, add(lowIn, v(0, 0, A_ARM_HALF_SPAN)), lower, add(lowIn, v(0, 0, A_ARM_HALF_SPAN))),
      link('beam', upright, lowOut, upright, strutBot),
    ];
    return finishCorner(ctx, axle, i, side, upright, wl, rate, [dome, upright, lower], visuals);
  });
