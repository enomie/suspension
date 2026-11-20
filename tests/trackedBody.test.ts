import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { buildTrackedVehicle, END_COLLIDER_RADIUS_SHARE } from '../src/physics/vehicle/tracked/buildTracked';
import type { TrackedVehicleSpec } from '../src/shared/trackedSpec';
import type { AxleSpec } from '../src/shared/vehicleSpec';

await RAPIER.init();

const DT = 1 / 120;

const axle = (z: number): AxleSpec => ({
  z,
  track: 2,
  y: -0.5,
  suspension: 'strut',
  spring: { frequencyHz: 1.5, dampingRatio: 0.5, travel: [-0.15, 0.15] },
  wheel: { radius: 0.3, width: 0.4, mass: 200, friction: 1, shape: 'cylinder' },
  brake: { torque: 1000 },
});

function spec(): TrackedVehicleSpec {
  return {
    name: 'tank',
    chassis: { size: [2.4, 0.6, 5], mass: 12000 },
    axles: [axle(-1.2), axle(0), axle(1.2)],
    idler: { z: -2.2, y: -0.4, radius: 0.3, width: 0.4 },
    sprocket: { z: 2.2, y: 0, radius: 0.35, width: 0.4 },
    track: 2,
    beltWidth: 0.4,
    chainThickness: 0.05,
    linkAsset: 'Drive_Chain_Link',
    drive: { maxTorque: 8000, maxPower: 300, reverseSpeed: 5 },
  };
}

function setup(s: TrackedVehicleSpec, y: number) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
  const built = buildTrackedVehicle(RAPIER, world, s, { x: 0, y, z: 0 });
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) {
      // parked: every wheel is held by its brake (free wheels would drift on any residual momentum or tilt)
      for (const c of built.corners) {
        c.joints.spin.configureMotorVelocity(0, 1e4);
        c.joints.spin.setMotorMaxForce(c.axle.brake.torque * 10);
      }
      world.step();
    }
  };
  return { world, built, run };
}

describe('tracked body', () => {
  it('builds a strut corner per side and road axle, plus an idler and sprocket collider per side', () => {
    const { built } = setup(spec(), 0.9);
    expect(built.corners).toHaveLength(6);
    expect(built.corners.map((c) => c.axleIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(built.endColliders).toHaveLength(4);
  });

  it('road wheel collider is as wide as the belt, radius includes the chain thickness', () => {
    const { built } = setup(spec(), 0.9);
    const shape = built.corners[0].wheel.collider(0).shape as RAPIER.RoundCylinder;
    expect(shape.radius + shape.borderRadius).toBeCloseTo(0.3 + 0.05, 6);
    expect(2 * (shape.halfHeight + shape.borderRadius)).toBeCloseTo(0.4, 6);
  });

  it('idler and sprocket colliders are small, fixed to the chassis and mirror left and right', () => {
    const s = spec();
    const { built } = setup(s, 0.9);
    const [idlerL, idlerR, sprocketL, sprocketR] = built.endColliders;
    for (const c of built.endColliders) expect(c.parent()!.handle).toBe(built.chassis.handle);
    const l = idlerL.translationWrtParent()!;
    const r = idlerR.translationWrtParent()!;
    expect([l.x, l.y, l.z]).toEqual([-1, expect.closeTo(-0.4, 6), expect.closeTo(-2.2, 6)]);
    expect([r.x, r.y, r.z]).toEqual([1, expect.closeTo(-0.4, 6), expect.closeTo(-2.2, 6)]);
    expect(sprocketL.translationWrtParent()!.z).toBeCloseTo(2.2, 5);
    expect(sprocketR.translationWrtParent()!.y).toBeCloseTo(0, 5);
    const shape = idlerL.shape as RAPIER.RoundCylinder;
    expect(shape.radius + shape.borderRadius).toBeCloseTo(0.3 * END_COLLIDER_RADIUS_SHARE, 6);
  });

  it('settles level on the ground at a stable ride height', () => {
    const { built, run } = setup(spec(), 0.9);
    run(5);
    const lv = built.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.05);
    const r = built.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.01);
    // wheel bottoms are at chassis y − 0.5 − 0.35 = −0.85: the chassis rests about 0.85 m above the ground
    expect(built.chassis.translation().y).toBeGreaterThan(0.7);
    expect(built.chassis.translation().y).toBeLessThan(1.0);
    // the small idler and sprocket colliders hang above the ground: they do not carry the vehicle
    expect(built.chassis.translation().y - 0.4 - 0.15).toBeGreaterThan(0);
  });

  it('every road wheel carries load', () => {
    const { built, run } = setup(spec(), 0.9);
    run(5);
    for (const c of built.corners) expect(c.wheel.translation().y).toBeLessThan(0.45);
    const ys = built.corners.map((c) => built.chassis.translation().y - c.wheel.translation().y);
    // all wheels hang about the same distance below the chassis
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.08);
  });

  it('rejects an invalid spec', () => {
    const s = spec();
    s.axles = [axle(0)];
    expect(() => setup(s, 0.9)).toThrow(/tracked vehicle 'tank'/);
  });
});
