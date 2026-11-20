import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { moped, motorcycle } from '../src/physics/vehicle/presets/motorcycle';
import type { DriverInput } from '../src/shared/driverInput';
import type { VehicleSpec } from '../src/physics/vehicle/types';

await RAPIER.init();

const DT = 1 / 120;
const idle: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

function setup(spec: VehicleSpec) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setFriction(0.95), ground);
  const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
  const run = (seconds: number, input: DriverInput = idle) => {
    for (let i = 0; i < seconds / DT; i++) {
      v.applyInput(input, DT);
      world.step();
    }
    v.updateTelemetry();
  };
  return { v, run, world };
}

describe.each([
  ['motorcycle', motorcycle],
  ['moped', moped],
])('%s balance', (_n, spec) => {
  it('stands upright at rest', () => {
    const { v, run } = setup(spec);
    run(5);
    expect(Math.abs(v.balance!.lean)).toBeLessThan(0.05);
    const lv = v.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.1);
  });

  it('rides straight without falling', () => {
    const { v, run } = setup(spec);
    run(1);
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      run(1, { ...idle, throttle: 1 });
      worst = Math.max(worst, Math.abs(v.balance!.lean));
    }
    expect(v.forwardSpeed).toBeGreaterThan(8);
    expect(worst).toBeLessThan(0.15);
  });

  it('recovers from a sideways push while riding', () => {
    const { v, run } = setup(spec);
    run(1);
    run(6, { ...idle, throttle: 1 });
    v.chassis.applyImpulse({ x: 40, y: 0, z: 0 }, true);
    run(0.2, { ...idle, throttle: 0.5 });
    run(4, { ...idle, throttle: 0.5 });
    expect(Math.abs(v.balance!.lean)).toBeLessThan(0.15);
  });

  it('leans into a left turn and comes back', () => {
    const { v, run } = setup(spec);
    run(1);
    run(6, { ...idle, throttle: 1 });
    let minLean = 0;
    for (let i = 0; i < 20; i++) {
      run(0.1, { ...idle, throttle: 0.3, steer: 0.6 });
      minLean = Math.min(minLean, v.balance!.lean);
    }
    expect(minLean).toBeLessThan(-0.1); // left = negative
    expect(v.chassis.translation().x).toBeLessThan(-0.5);
    run(5, { ...idle, throttle: 0.3 });
    expect(Math.abs(v.balance!.lean)).toBeLessThan(0.15);
  });
});
