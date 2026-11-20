import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { car } from '../src/physics/vehicle/presets/car';
import type { DriverInput } from '../src/shared/driverInput';

await RAPIER.init();

const DT = 1 / 120;
const idle: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

function setup(y = 0.6) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
  const v = new Vehicle(RAPIER, world, car, { x: 0, y, z: 0 });
  const run = (seconds: number, input: DriverInput = idle) => {
    for (let i = 0; i < seconds / DT; i++) {
      v.applyInput(input, DT);
      world.step();
    }
    v.updateTelemetry();
  };
  return { world, v, run };
}

describe('car (strut suspension)', () => {
  it('settles at design ride height without drifting', () => {
    const { v, run } = setup();
    run(4);
    for (const c of v.corners) expect(Math.abs(c.telemetry.travel)).toBeLessThan(0.03);
    const lv = v.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.05);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.01);
  });

  it('respects suspension travel limits when dropped', () => {
    const { v, world } = setup(2.5);
    let min = 0;
    let max = 0;
    for (let i = 0; i < 360; i++) {
      v.applyInput(idle, DT);
      world.step();
      v.updateTelemetry();
      for (const c of v.corners) {
        min = Math.min(min, c.telemetry.travel);
        max = Math.max(max, c.telemetry.travel);
      }
    }
    expect(min).toBeGreaterThan(-0.1 - 0.05);
    expect(max).toBeLessThan(0.12 + 0.05);
  });

  it('drives forward (−Z) with W', () => {
    const { v, run } = setup();
    run(1);
    run(3, { ...idle, throttle: 1 });
    expect(v.forwardSpeed).toBeGreaterThan(5);
    expect(v.chassis.translation().z).toBeLessThan(-5);
  });

  it('reverses with S from standstill', () => {
    const { v, run } = setup();
    run(1);
    run(2, { ...idle, brake: 1 });
    expect(v.forwardSpeed).toBeLessThan(-1);
  });

  it('steers left with A (Ackermann: inner wheel more)', () => {
    const { v, run } = setup();
    run(1);
    run(3, { ...idle, throttle: 0.5, steer: 1 });
    const fl = v.corners.find((c) => c.id === 'car.a0L')!;
    const fr = v.corners.find((c) => c.id === 'car.a0R')!;
    expect(fl.telemetry.steerAngle).toBeGreaterThan(fr.telemetry.steerAngle);
    expect(fr.telemetry.steerAngle).toBeGreaterThan(0);
    expect(v.chassis.translation().x).toBeLessThan(-0.5);
  });

  it('handbrake locks only the rear wheels', () => {
    const { v, run } = setup();
    run(1);
    run(3, { ...idle, throttle: 1 });
    run(0.3, { ...idle, handbrake: true });
    const rear = v.corners.filter((c) => c.axleIndex === 1);
    const front = v.corners.filter((c) => c.axleIndex === 0);
    for (const c of rear) expect(Math.abs(c.telemetry.wheelOmega)).toBeLessThan(1);
    for (const c of front) expect(c.telemetry.wheelOmega).toBeGreaterThan(5);
  });
});
