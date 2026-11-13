import { cornerId, partId } from '../../ids';
import { AX, add, armLimits, coilover, finishCorner, helper, leverRatio, lerp, link, revolute, springFor, springJoint, v, W, wheelLocal, wheelRate } from './common';
import type { AxleBuilder } from './types';
import type { Side } from '../../types';

const ARM_LENGTH = 0.55;

/**
 * 8 · Verbundlenker
 *   2 Längslenker (Revolute X am Chassis) + Torsionsprofil:
 *   Lenker L ─[Revolute X, Positions-Motor = Torsionssteifigkeit]→ Lenker R  (wirkt als Stabilisator)
 */
export const buildTwistBeam: AxleBuilder = (ctx, axle, i) => {
  const rate = wheelRate(ctx, axle, i, 2);
  const arms: Record<'L' | 'R', ReturnType<typeof helper>> = {} as never;
  const pivots: Record<'L' | 'R', ReturnType<typeof W>> = {} as never;
  const visuals = [];
  for (const side of ['L', 'R'] as Side[] as ('L' | 'R')[]) {
    const s = side === 'L' ? -1 : 1;
    const wc = W(ctx, wheelLocal(axle, side));
    const inb = -s * (axle.wheel.width / 2 + 0.15);
    const pivot = add(wc, v(inb, 0.04, -ARM_LENGTH));
    const arm = helper(ctx, axle, wc, partId(cornerId(ctx.name, i, side), 'arm'));
    const j = revolute(ctx, ctx.chassis, arm, pivot, AX.X);
    armLimits(j, AX.X, pivot, wc, axle.spring.travel);
    const sp = add(wc, v(inb, 0, -0.08));
    const top = add(sp, v(0, 0.45, 0));
    springJoint(ctx, ctx.chassis, top, arm, sp, springFor(rate, leverRatio(AX.X, pivot, sp, wc)));
    visuals.push(link('beam', arm, pivot, arm, add(wc, v(inb, 0, 0))), link('rod', arm, add(wc, v(inb, 0, 0)), arm, wc));
    visuals.push(...coilover(ctx.chassis, top, arm, sp));
    arms[side] = arm;
    pivots[side] = pivot;
  }
  // Torsion: Drehung der Lenker gegeneinander um die gemeinsame Schwenkachse
  const mid = lerp(pivots.L, pivots.R, 0.5);
  const tj = revolute(ctx, arms.L, arms.R, mid, AX.X);
  const kRoll = 0.6 * rate.kWheel * ARM_LENGTH * ARM_LENGTH; // N·m/rad
  tj.configureMotorModel(ctx.R.MotorModel.ForceBased);
  tj.configureMotorPosition(0, kRoll, kRoll * 0.05);
  // Profil sichtbar auf 35 % Lenkerlänge
  const bl = lerp(pivots.L, W(ctx, wheelLocal(axle, 'L')), 0.35);
  const br = lerp(pivots.R, W(ctx, wheelLocal(axle, 'R')), 0.35);
  visuals.push(link('beam', arms.L, bl, arms.R, br));

  return [
    finishCorner(ctx, axle, i, 'L', arms.L, wheelLocal(axle, 'L'), rate, [arms.L], visuals),
    finishCorner(ctx, axle, i, 'R', arms.R, wheelLocal(axle, 'R'), rate, [arms.R], []),
  ];
};
