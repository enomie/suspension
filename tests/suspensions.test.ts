import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { PRESETS } from '../src/physics/vehicle/presets';
import type { DriverInput, VehicleSpec } from '../src/physics/vehicle/types';

await RAPIER.init();

const DT = 1 / 120;
const idle: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

function setup(spec: VehicleSpec) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
  const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
  const run = (seconds: number, input: DriverInput = idle) => {
    for (let i = 0; i < seconds / DT; i++) {
      v.applyInput(input, DT);
      world.step();
    }
    v.updateTelemetry();
  };
  return { v, run };
}

const upright = (v: Vehicle) => {
  const r = v.chassis.rotation();
  return Math.abs(r.x) + Math.abs(r.z);
};

describe.each(PRESETS.map((p, i) => [`${(i + 1) % 10} ${p.label}`, p] as const))('%s', (_n, spec) => {
  it('settles near design ride height, level and at rest', () => {
    const { v, run } = setup(spec);
    run(4);
    const travels = v.corners.map((c) => c.telemetry.travel);
    for (const t of travels) expect(Math.abs(t)).toBeLessThan(0.05);
    const lv = v.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.1);
    expect(upright(v)).toBeLessThan(0.03);
  });

  it('drives forward, steers left, stays upright', () => {
    const { v, run } = setup(spec);
    run(1);
    run(3, { ...idle, throttle: 1 });
    expect(v.forwardSpeed).toBeGreaterThan(5);
    run(2, { ...idle, throttle: 0.4, steer: 1 });
    expect(upright(v)).toBeLessThan(0.3);
    expect(v.chassis.translation().x).toBeLessThan(-0.5);
  });
});
