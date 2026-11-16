import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { AxleSpec, Corner, LinkVisual, Side, Vec3 } from '../../types';
import type { BuildContext } from '../context';
import { cornerId, partId } from '../../ids';
import { createWheel } from '../wheel';
import { createHelperBody } from '../knuckle';
import { dampingCoeff, G, springRate } from '../../tuning';

/**
 * shared building blocks of all suspensions.
 * at build all bodies have identity rotation → joint axes in world = local,
 * local anchors = world point − body position.
 */
export type P = { x: number; y: number; z: number };

export const AX = {
  X: { x: 1, y: 0, z: 0 },
  Y: { x: 0, y: 1, z: 0 },
  Z: { x: 0, y: 0, z: 1 },
  DOWN: { x: 0, y: -1, z: 0 },
  /** wheel spin axis: positive rate = forward (−Z) */
  SPIN: { x: -1, y: 0, z: 0 },
};

export const STEER_STIFFNESS = 4e4; // N·m/rad
export const STEER_DAMPING = 1.5e3; // N·m·s/rad

export const sideSign = (s: Side) => (s === 'L' ? -1 : s === 'R' ? 1 : 0);
export const v = (x: number, y: number, z: number): P => ({ x, y, z });
export const add = (a: P, b: P): P => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: P, b: P): P => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const lerp = (a: P, b: P, t: number): P =>
  v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const len = (a: P) => Math.hypot(a.x, a.y, a.z);
export const norm = (a: P): P => {
  const l = len(a) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};
const cross = (a: P, b: P): P => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const toVec3 = (p: P): Vec3 => [p.x, p.y, p.z];

/** wheel center (chassis-local) */
export function wheelLocal(axle: AxleSpec, side: Side, dz = 0): P {
  return v(sideSign(side) * (axle.track / 2), axle.y, axle.z + dz);
}

/** chassis-local → world (spawn without rotation) */
export const W = (ctx: BuildContext, l: P): P => add(ctx.origin, l);

function localOn(body: RAPIER.RigidBody, w: P): P {
  return sub(w, body.translation());
}

/** visual anchor: world point fixed on body */
export function at(body: RAPIER.RigidBody, w: P) {
  return { body, local: toVec3(localOn(body, w)) };
}

export function link(kind: LinkVisual['kind'], b1: RAPIER.RigidBody, w1: P, b2: RAPIER.RigidBody, w2: P): LinkVisual {
  return { kind, a: at(b1, w1), b: at(b2, w2) };
}

/** helper body (arms, carrier …) — mass relative to wheel. */
export function helper(ctx: BuildContext, axle: AxleSpec, w: P, id: string, massFactor = 0.5): RAPIER.RigidBody {
  const m = axle.wheel.mass * massFactor;
  const b = createHelperBody(ctx.R, ctx.world, w, m, 0.5 * m * axle.wheel.radius ** 2 + 0.05);
  ctx.names.set(b.handle, id);
  return b;
}

type Joint = RAPIER.ImpulseJoint;
function create<T extends Joint>(ctx: BuildContext, data: RAPIER.JointData, b1: RAPIER.RigidBody, b2: RAPIER.RigidBody): T {
  const j = ctx.world.createImpulseJoint(data, b1, b2, true);
  j.setContactsEnabled(false);
  return j as T;
}

/**
 * `marks`: where the joint markers are drawn (default: the anchor `w`). Pass several points along the axis for a
 * hinge that is built from multiple bearings, e.g. the two bushings of an A-arm.
 */
export function revolute(ctx: BuildContext, b1: RAPIER.RigidBody, b2: RAPIER.RigidBody, w: P, axis: P, marks: P[] = [w]) {
  if (b1.handle === ctx.chassis.handle) for (const m of marks) ctx.mounts.push(toVec3(localOn(b1, m)));
  for (const m of marks) ctx.joints.push({ kind: 'revolute', body: b2, local: toVec3(localOn(b2, m)), axis: toVec3(axis) });
  return create<RAPIER.RevoluteImpulseJoint>(ctx, ctx.R.JointData.revolute(localOn(b1, w), localOn(b2, w), axis), b1, b2);
}
export function spherical(ctx: BuildContext, b1: RAPIER.RigidBody, b2: RAPIER.RigidBody, w: P) {
  if (b1.handle === ctx.chassis.handle) ctx.mounts.push(toVec3(localOn(b1, w)));
  ctx.joints.push({ kind: 'spherical', body: b2, local: toVec3(localOn(b2, w)), axis: [0, 1, 0] });
  return create<RAPIER.SphericalImpulseJoint>(ctx, ctx.R.JointData.spherical(localOn(b1, w), localOn(b2, w)), b1, b2);
}
export function prismatic(ctx: BuildContext, b1: RAPIER.RigidBody, b2: RAPIER.RigidBody, w: P, axis: P) {
  return create<RAPIER.PrismaticImpulseJoint>(ctx, ctx.R.JointData.prismatic(localOn(b1, w), localOn(b2, w), axis), b1, b2);
}
/** rope = max distance (bump stop) */
export function rope(ctx: BuildContext, b1: RAPIER.RigidBody, w1: P, b2: RAPIER.RigidBody, w2: P, maxLen: number) {
  return create(ctx, ctx.R.JointData.rope(maxLen, localOn(b1, w1), localOn(b2, w2)), b1, b2);
}

/** spring/damper values at wheel center */
export interface WheelRate {
  kWheel: number;
  cWheel: number;
  /** static load per wheel [N] */
  load: number;
}

export function wheelRate(ctx: BuildContext, axle: AxleSpec, axleIndex: number, springsOnAxle: number): WheelRate {
  const m = ctx.axleSprungMass[axleIndex] / springsOnAxle;
  const s = axle.spring;
  const kWheel = s.stiffness ?? springRate(m, s.frequencyHz ?? 1.5);
  const cWheel = s.damping ?? dampingCoeff(kWheel, m, s.dampingRatio ?? 0.4);
  return { kWheel, cWheel, load: m * G };
}

/**
 * scale spring for motion ratio MR = spring travel / wheel travel:
 * k_spring = k_wheel / MR², c likewise, spring force = load / MR.
 */
export function springFor(r: WheelRate, mr: number) {
  const m = Math.max(0.05, Math.abs(mr));
  return { k: r.kWheel / (m * m), c: r.cWheel / (m * m), force: r.load / m };
}

/** spring joint (Rapier spring) between two points, preloaded to static load. */
export function springJoint(
  ctx: BuildContext,
  b1: RAPIER.RigidBody,
  w1: P,
  b2: RAPIER.RigidBody,
  w2: P,
  s: { k: number; c: number; force: number },
) {
  const rest = len(sub(w2, w1)) + s.force / s.k;
  return create(ctx, ctx.R.JointData.spring(rest, s.k, s.c, localOn(b1, w1), localOn(b2, w2)), b1, b2);
}

/** spring+damper as prismatic position motor; axis points in jounce direction. */
export function prismaticSpring(
  ctx: BuildContext,
  j: RAPIER.PrismaticImpulseJoint,
  s: { k: number; c: number; force: number },
  limits: [number, number],
) {
  j.setLimits(limits[0], limits[1]);
  j.configureMotorModel(ctx.R.MotorModel.ForceBased);
  j.configureMotorPosition(s.force / s.k, s.k, s.c);
}

/** vertical travel of a point per rad of swing about an axis */
function dyPerRad(axis: P, pivot: P, point: P): number {
  return cross(axis, sub(point, pivot)).y;
}

/** spring/wheel ratio for lever about `axis` through `pivot` (vertical spring at `springPt`). */
export function leverRatio(axis: P, pivot: P, springPt: P, wheel: P): number {
  return dyPerRad(axis, pivot, springPt) / dyPerRad(axis, pivot, wheel);
}

/** swing-arm angle limits from desired wheel travel [−jounce, +rebound]. */
export function armLimits(j: RAPIER.RevoluteImpulseJoint, axis: P, pivot: P, wheel: P, travel: [number, number]) {
  const d = dyPerRad(axis, pivot, wheel);
  const a = -travel[0] / d;
  const b = -travel[1] / d;
  j.setLimits(Math.min(a, b), Math.max(a, b));
}

/**
 * finish corner: (steerable) knuckle with revolute Y on carrier, then wheel with revolute X.
 * each suspension only supplies carrier + its arms/springs.
 */
export function finishCorner(
  ctx: BuildContext,
  axle: AxleSpec,
  axleIndex: number,
  side: Side,
  carrier: RAPIER.RigidBody,
  wheelL: P,
  rate: { kWheel: number; load: number },
  bodies: RAPIER.RigidBody[],
  visuals: LinkVisual[],
  idSuffix = '',
): Corner {
  const { R, world } = ctx;
  const id = cornerId(ctx.name, axleIndex, side) + idSuffix;
  const wc = W(ctx, wheelL);
  let parent = carrier;
  let knuckle: RAPIER.RigidBody | undefined;
  let steer: RAPIER.RevoluteImpulseJoint | undefined;
  if (axle.steer) {
    knuckle = helper(ctx, axle, wc, partId(id, 'knuckle'));
    steer = revolute(ctx, carrier, knuckle, wc, AX.Y);
    steer.setLimits(-axle.steer.maxAngle, axle.steer.maxAngle);
    steer.configureMotorModel(R.MotorModel.ForceBased);
    steer.configureMotorPosition(0, STEER_STIFFNESS, STEER_DAMPING);
    parent = knuckle;
  }
  const wheel = createWheel(R, world, axle.wheel, wc);
  ctx.names.set(wheel.handle, partId(id, 'wheel'));
  const spin = revolute(ctx, parent, wheel, wc, AX.SPIN);
  spin.configureMotorModel(R.MotorModel.ForceBased);

  return {
    id,
    axleIndex,
    side,
    axle,
    anchor: toVec3(wheelL),
    carrier,
    knuckle,
    wheel,
    joints: { steer, spin },
    bodies: [...bodies, ...(knuckle ? [knuckle] : []), wheel],
    visuals,
    stiffness: rate.kWheel,
    preload: rate.load / rate.kWheel,
    telemetry: { travel: 0, springForce: 0, wheelOmega: 0, steerAngle: 0 },
  };
}

/** strut visuals: spring + damper between two points */
export function coilover(b1: RAPIER.RigidBody, w1: P, b2: RAPIER.RigidBody, w2: P): LinkVisual[] {
  return [link('spring', b1, w1, b2, w2), link('damper', b1, w1, b2, w2)];
}
