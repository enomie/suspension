import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { TrackedVehicle } from '../src/physics/vehicle/tracked/TrackedVehicle';
import { neutralInput, type DriverInput } from '../src/shared/driverInput';
import type { TrackedVehicleSpec } from '../src/shared/trackedSpec';
import type { AxleSpec } from '../src/shared/vehicleSpec';

await RAPIER.init();

const DT = 1 / 120;
const input = (o: Partial<DriverInput>): DriverInput => ({ ...neutralInput(), ...o });

const axle = (z: number): AxleSpec => ({
  z,
  track: 2,
  y: -0.5,
  suspension: 'strut',
  spring: { frequencyHz: 1.5, dampingRatio: 0.5, travel: [-0.15, 0.15] },
  wheel: { radius: 0.3, width: 0.4, mass: 100, friction: 0.8, shape: 'cylinder' },
  brake: { torque: 4700 },
});

const spec: TrackedVehicleSpec = {
  type: 'tracked',
  name: 'tank',
  chassis: { size: [2.4, 0.6, 5], mass: 12000 },
  axles: [axle(-1.2), axle(0), axle(1.2)],
  idler: { z: -2.2, y: -0.4, radius: 0.3, width: 0.4 },
  sprocket: { z: 2.2, y: 0, radius: 0.35, width: 0.4 },
  track: 2,
  beltWidth: 0.4,
  chainThickness: 0.05,
  drive: { maxTorque: 44000, maxPower: 400_000, reverseSpeed: 5 },
};

function setup() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
  const v = new TrackedVehicle(RAPIER, world, spec, { x: 0, y: 0.9, z: 0 });
  const run = (seconds: number, i: DriverInput = neutralInput()) => {
    for (let k = 0; k < seconds / DT; k++) {
      v.applyInput(i, DT);
      world.step();
    }
  };
  /** heading angle about Y, + = turned left (counter-clockwise from above) */
  const yaw = () => {
    const q = v.chassis.rotation();
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  };
  return { v, run, yaw };
}

describe('tracked drive', () => {
  it('stays parked without input', () => {
    const { v, run } = setup();
    run(3);
    const t0 = v.chassis.translation();
    run(3);
    const t1 = v.chassis.translation();
    expect(Math.hypot(t1.x - t0.x, t1.z - t0.z)).toBeLessThan(0.05);
  });

  it('drives forward (−Z) in a straight line with throttle', () => {
    const { v, run, yaw } = setup();
    run(1);
    run(4, input({ throttle: 1 }));
    expect(v.forwardSpeed).toBeGreaterThan(2);
    expect(v.chassis.translation().z).toBeLessThan(-3);
    expect(Math.abs(v.chassis.translation().x)).toBeLessThan(0.3);
    expect(Math.abs(yaw())).toBeLessThan(0.05);
  });

  it('reverses with brake at standstill', () => {
    const { v, run } = setup();
    run(1);
    run(3, input({ brake: 1 }));
    expect(v.forwardSpeed).toBeLessThan(-1);
    expect(v.chassis.translation().z).toBeGreaterThan(1);
  });

  it('half steer turns left while driving on, negative steer turns right', () => {
    const a = setup();
    a.run(1);
    a.run(3, input({ throttle: 1, steer: 0.5 }));
    expect(a.v.forwardSpeed).toBeGreaterThan(2);
    expect(a.v.chassis.angvel().y).toBeGreaterThan(0.1);
    const b = setup();
    b.run(1);
    b.run(3, input({ throttle: 1, steer: -0.5 }));
    expect(b.v.chassis.angvel().y).toBeLessThan(-0.1);
  });

  it('full steer while driving brakes the inner track hard: the vehicle slows and pivots', () => {
    const { v, run } = setup();
    run(1);
    run(3, input({ throttle: 1 }));
    const fast = v.forwardSpeed;
    run(3, input({ throttle: 1, steer: 1 }));
    expect(v.forwardSpeed).toBeLessThan(fast / 2);
    expect(v.chassis.angvel().y).toBeGreaterThan(0.5);
  });

  it('turns on the spot without throttle, staying close to where it was', () => {
    const { v, run } = setup();
    run(1);
    const t0 = v.chassis.translation();
    run(1, input({ steer: 1 }));
    expect(v.chassis.angvel().y).toBeGreaterThan(0.3); // counter-clockwise from above = left
    run(2, input({ steer: 1 }));
    const t1 = v.chassis.translation();
    expect(Math.hypot(t1.x - t0.x, t1.z - t0.z)).toBeLessThan(1.5);
  });

  it('steers after letting go of the throttle while rolling fast', () => {
    const { v, run, yaw } = setup();
    run(1);
    run(5, input({ throttle: 1 }));
    expect(v.forwardSpeed).toBeGreaterThan(5);
    const y0 = yaw();
    run(2, input({ steer: 1 }));
    expect(yaw() - y0).toBeGreaterThan(0.3); // turns left (before the fix: barely moved)
    expect(v.forwardSpeed).toBeLessThan(10); // and slows down, it does not accelerate
  });

  it('coasts after letting go of the throttle instead of braking, and parks once it is nearly stopped', () => {
    const { v, run } = setup();
    run(1);
    run(5, input({ throttle: 1 }));
    const s0 = v.forwardSpeed;
    run(2);
    expect(v.forwardSpeed).toBeGreaterThan(s0 * 0.6); // rolls on: 2 s of braking at full torque would nearly stop it
  });

  it('brakes to a stop (holding the brake on would then reverse)', () => {
    const { v, run } = setup();
    run(1);
    run(4, input({ throttle: 1 }));
    expect(v.forwardSpeed).toBeGreaterThan(2);
    let t = 0;
    while (v.forwardSpeed > 0.6 && t < 4) {
      run(DT, input({ brake: 1 }));
      t += DT;
    }
    expect(t).toBeLessThan(4);
    expect(v.forwardSpeed).toBeLessThanOrEqual(0.6);
  });
});

describe('tracked coasting', () => {
  it('rolls on after letting go of the throttle, but rolling resistance slows it to a stop in well under a minute', () => {
    const { v, run } = setup();
    run(1);
    run(5, input({ throttle: 1 }));
    run(10);
    const s10 = v.forwardSpeed;
    expect(s10).toBeGreaterThan(1);
    run(40);
    expect(v.forwardSpeed).toBeLessThan(1);
    expect(Math.abs(v.forwardSpeed)).toBeLessThan(s10);
  });
});
