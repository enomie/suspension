import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { createVehicle } from '../src/physics/vehicle/createVehicle';
import { car } from '../src/physics/vehicle/presets/car';
import { trophyTruck } from '../src/physics/vehicle/presets/trophyTruck';
import { moped, motorcycle } from '../src/physics/vehicle/presets/bike';
import { bikeVehicleSpec } from '../src/shared/bikeSpec';
import type { AnyVehicleSpec } from '../src/shared/anyVehicleSpec';
import { topSpeed } from '../src/shared/performance';
import { PHYSICS_DT, PHYSICS_SUBSTEPS } from '../src/shared/stepClock';
import type { DriverInput } from '../src/shared/driverInput';

await RAPIER.init();

const SUB_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;

/** full throttle on a long flat plane (like Simulation: 4 solver steps per tick); returns the peak forward speed [m/s] */
function drive(spec: AnyVehicleSpec, seconds: number): number {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = SUB_DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000).setFriction(0.95), ground);
  const v = createVehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
  const input: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  let peak = 0;
  for (let i = 0; i < (seconds / PHYSICS_DT) * PHYSICS_SUBSTEPS; i++) {
    input.throttle = i > 2 * PHYSICS_SUBSTEPS * 120 ? 1 : 0;
    v.applyInput(input, SUB_DT);
    world.step();
    peak = Math.max(peak, v.forwardSpeed);
  }
  return peak;
}

describe('top speed = thrust vs rolling + air drag', () => {
  it.each([
    ['car', car, 90],
    ['trophy', trophyTruck, 60],
    ['motorcycle', bikeVehicleSpec(motorcycle), 47],
    ['moped', bikeVehicleSpec(moped), 28],
  ] as const)('%s: analytic top speed ≈ %d m/s', (_n, spec, target) => {
    expect(topSpeed(spec)).toBeGreaterThan(target * 0.97);
    expect(topSpeed(spec)).toBeLessThan(target * 1.03);
  });

  it('boost raises the top speed, the limiter caps it', () => {
    expect(topSpeed(car, true)).toBeGreaterThan(topSpeed(car) * 1.4);
    expect(topSpeed(trophyTruck, true)).toBe(64);
  });

  // peak speed after a full-throttle run on flat ground: approaches the analytic top speed from below, never beyond it.
  // The bikes stay clearly below it (balance assist and tire contact cost thrust; same before this model).
  it.each([
    ['moped', moped, 0.6],
    ['motorcycle', motorcycle, 0.5],
  ] as const)('%s: simulated speed approaches the analytic top speed', (_n, spec, minShare) => {
    const peak = drive(spec, 60);
    const target = topSpeed(bikeVehicleSpec(spec));
    expect(peak).toBeLessThan(target * 1.02);
    expect(peak).toBeGreaterThan(target * minShare);
  }, 60_000);
});
