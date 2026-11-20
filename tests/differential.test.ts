import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { buildCustomSpec, DEFAULT_CUSTOM } from '../src/shared/customVehicle';
import type { DriverInput } from '../src/physics/vehicle/types';

await RAPIER.init();

const DT = 1 / 120;

/** Mean |ω_left − ω_right| of the driven rear axle while cornering under throttle */
function wheelSpeedSpread(differential: boolean, diffLock = false): number {
  const config = { ...DEFAULT_CUSTOM, axles: DEFAULT_CUSTOM.axles.map((a, i) => (i === 1 ? { ...a, differential } : a)) };
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
  const v = new Vehicle(RAPIER, world, buildCustomSpec(config), { x: 0, y: 0.6, z: 0 });
  const input: DriverInput = { throttle: 0.5, brake: 0, steer: 1, handbrake: false, diffLock };
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 10 / DT; i++) {
    v.applyInput(input, DT);
    world.step();
    v.updateTelemetry();
    if (i > 5 / DT) {
      const [a, b] = v.corners.filter((c) => c.axleIndex === 1);
      sum += Math.abs(a.telemetry.wheelOmega - b.telemetry.wheelOmega);
      n++;
    }
  }
  return sum / n;
}

describe('differential', () => {
  const open = wheelSpeedSpread(true);
  it('an open differential lets the inner and outer wheel turn at different speeds in a turn', () => {
    expect(open).toBeGreaterThan(0.5);
  });
  it('no differential (spooled axle) forces equal wheel speeds', () => {
    expect(wheelSpeedSpread(false)).toBeLessThan(open * 0.5);
  });
  it('the lock turns an open differential into a spooled axle', () => {
    expect(wheelSpeedSpread(true, true)).toBeLessThan(open * 0.5);
  });
});

describe('differential lock toggled while driving', () => {
  it('engages and releases without disturbing the vehicle', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    world.numSolverIterations = 8;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
    const v = new Vehicle(RAPIER, world, buildCustomSpec(DEFAULT_CUSTOM), { x: 0, y: 0.6, z: 0 });
    expect(v.differentials.coupled).toBe(0);
    const run = (s: number, diffLock: boolean) => {
      for (let i = 0; i < s / DT; i++) {
        v.applyInput({ throttle: 1, brake: 0, steer: 0.4, handbrake: false, diffLock }, DT);
        world.step();
      }
    };
    run(4, false);
    run(2, true);
    expect(v.differentials.coupled).toBe(1);
    const speed = v.forwardSpeed;
    expect(speed).toBeGreaterThan(3);
    run(2, false);
    expect(v.differentials.coupled).toBe(0);
    expect(v.forwardSpeed).toBeGreaterThan(speed * 0.8);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.3);
  });
});
