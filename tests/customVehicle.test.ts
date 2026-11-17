import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { topSpeed } from '../src/shared/performance';
import { torusWheelWidth } from '../src/shared/unitTorus';
import { buildCustomSpec, CUSTOM_LIMITS, DEFAULT_CUSTOM, type CustomAxleConfig, type CustomVehicleConfig } from '../src/shared/customVehicle';
import type { DriverInput } from '../src/physics/vehicle/types';

await RAPIER.init();

const DT = 1 / 120;
const idle: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const axle = (o: Partial<CustomAxleConfig>): CustomAxleConfig => ({
  wheels: 'pair',
  wheelShape: 'cylinder',
  wheelWidth: 0.22,
  track: 1.6,
  steer: 'none',
  suspension: 'solidAxle',
  drive: false,
  wheelRadius: 0.33,
  ...o,
});

const CASES: [string, CustomVehicleConfig][] = [
  ['default (steer double wishbone + driven solid axle)', DEFAULT_CUSTOM],
  ['steering McPherson + non-steering tandem bogie', { ...DEFAULT_CUSTOM, wheelbase: 3.6, axles: [axle({ steer: 'steer', suspension: 'macPherson' }), axle({ suspension: 'bogie', drive: true })] }],
  ['4-wheel steering: McPherson front, counter-steering McPherson rear', { ...DEFAULT_CUSTOM, wheelbase: 2.8, axles: [axle({ steer: 'steer', suspension: 'macPherson' }), axle({ steer: 'counter', suspension: 'macPherson', drive: true })] }],
  ['3 axles, 5 m', { ...DEFAULT_CUSTOM, wheelbase: 3.6, axles: [axle({ steer: 'steer', suspension: 'doubleWishbone' }), axle({ drive: true }), axle({ drive: true })] }],
  ['Cessna: steering center strut nose + driven spring-leg mains', { ...DEFAULT_CUSTOM, wheelbase: 2.2, axles: [axle({ wheels: 'center', steer: 'steer', suspension: 'strut' }), axle({ suspension: 'springLeg', drive: true })] }],
  ['trike: steering center fork + driven pair', { ...DEFAULT_CUSTOM, wheelbase: 2.4, axles: [axle({ wheels: 'center', steer: 'steer', suspension: 'telescopicFork' }), axle({ drive: true })] }],
  ['jumbo: steering center double wheel + tandem bogie mains', { ...DEFAULT_CUSTOM, wheelbase: 6, axles: [axle({ wheels: 'centerDouble', steer: 'steer', suspension: 'strut' }), axle({ suspension: 'bogie', drive: true })] }],
  ['center swingarm rear (bike-like)', { ...DEFAULT_CUSTOM, wheelbase: 2, axles: [axle({ suspension: 'strut' }), axle({ wheels: 'center', suspension: 'swingArm', drive: true })] }],
  ['different wheel sizes per axle', { ...DEFAULT_CUSTOM, wheelbase: 3, axles: [axle({ steer: 'steer', suspension: 'strut', wheelRadius: 0.3 }), axle({ drive: true, wheelRadius: 0.45 })] }],
];

describe.each(CASES)('custom: %s', (_name, config) => {
  const spec = buildCustomSpec(config);
  const setup = () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    world.numSolverIterations = 8;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
    const run = (s: number, input: DriverInput = idle) => {
      for (let i = 0; i < s / DT; i++) {
        v.applyInput(input, DT);
        world.step();
      }
      v.updateTelemetry();
    };
    return { v, run };
  };

  it('settles level near the design ride height', () => {
    const { v, run } = setup();
    run(4);
    for (const c of v.corners) expect(Math.abs(c.telemetry.travel)).toBeLessThan(0.08);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.05);
  });

  it('drives forward when an axle is driven and stays upright', () => {
    const { v, run } = setup();
    run(1);
    run(4, { ...idle, throttle: 1 });
    expect(v.forwardSpeed).toBeGreaterThan(4);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.1);
  });
});

describe('buildCustomSpec', () => {
  it('spaces axles evenly along the wheelbase and corrects invalid steering suspensions', () => {
    const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, wheelbase: 3.6, axles: [axle({ steer: 'steer', suspension: 'bogie' }), axle({}), axle({})] });
    expect(spec.axles.map((a) => a.z)).toEqual([-1.8, 0, 1.8]);
    expect(spec.axles[0].suspension).not.toBe('bogie');
    expect(spec.axles[0].track).toBe(1.6);
  });
});

describe('wheel shapes', () => {
  it('cylinder uses the width field; torus takes its width from the radius', () => {
    const [cyl, tor] = buildCustomSpec({ ...DEFAULT_CUSTOM, axles: [axle({ wheelWidth: 0.3 }), axle({ wheelShape: 'torus', wheelWidth: 0.3 })] }).axles;
    expect(cyl.wheel).toMatchObject({ shape: 'roundCylinder', tire: 'tread', width: 0.3 });
    expect(tor.wheel).toMatchObject({ shape: 'torus', tire: 'torus' });
    expect(tor.wheel.width).toBeCloseTo(torusWheelWidth(0.33));
  });
  it.each(['cylinder', 'torus'] as const)('%s wheels: aircraft setup settles and drives', (wheelShape) => {
    const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, wheelbase: 5, axles: [axle({ wheels: 'centerDouble', steer: 'steer', suspension: 'strut', wheelShape }), axle({ suspension: 'springLeg', drive: true, wheelShape })] });
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    world.numSolverIterations = 8;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
    for (let i = 0; i < 5 * 120; i++) {
      v.applyInput({ ...idle, throttle: i > 120 ? 1 : 0 }, DT);
      world.step();
    }
    expect(v.forwardSpeed).toBeGreaterThan(4);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.1);
  });
});

describe('wheel layouts', () => {
  it('centered layouts build track 0 axles; centerDouble is a twin; the track field is ignored', () => {
    const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, axles: [axle({ wheels: 'centerDouble', steer: 'steer', suspension: 'strut', track: 2 }), axle({ wheels: 'center', suspension: 'swingArm' }), axle({})] });
    expect(spec.axles.map((a) => a.track)).toEqual([0, 0, 1.6]);
    expect(spec.axles.map((a) => !!a.twin)).toEqual([true, false, false]);
  });
  it('corrects suspensions a layout cannot carry (fork needs steering, pair types need a pair)', () => {
    const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, axles: [axle({ wheels: 'center', suspension: 'telescopicFork' }), axle({ wheels: 'center', steer: 'steer', suspension: 'doubleWishbone' })] });
    expect(spec.axles.map((a) => a.suspension)).toEqual(['strut', 'strut']);
  });
  it('twin strut builds two wheels that steer together', () => {
    const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, wheelbase: 5, axles: [axle({ wheels: 'centerDouble', steer: 'steer', suspension: 'strut' }), axle({ drive: true })] });
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
    expect(v.corners.filter((c) => c.axleIndex === 0)).toHaveLength(2);
    expect(spec.axles[0].twin).toBe(true);
  });
});

describe('steering modes', () => {
  const steerAngles = (rear: CustomAxleConfig['steer']) => {
    const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, wheelbase: 2.8, axles: [axle({ steer: 'steer', suspension: 'macPherson' }), axle({ steer: rear, suspension: 'macPherson', drive: true })] });
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500), ground);
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
    for (let i = 0; i < 2 * 120; i++) {
      v.applyInput({ ...idle, steer: 1 }, DT);
      world.step();
    }
    v.updateTelemetry();
    const at = (axleIndex: number) => v.corners.find((c) => c.axleIndex === axleIndex)!.telemetry.steerAngle;
    return [at(0), at(1)];
  };

  it('counter-steering rear axle turns against the front axle', () => {
    const [front, rear] = steerAngles('counter');
    expect(front).toBeGreaterThan(0.1);
    expect(rear).toBeLessThan(-0.05);
  });

  it('"steer" on the rear axle turns with the front axle; "none" does not steer', () => {
    const [front, rear] = steerAngles('steer');
    expect(rear * front).toBeGreaterThan(0);
    expect(steerAngles('none')[1]).toBe(0);
  });
});

describe('custom drive fields', () => {
  it('torque and power are clamped and reach the spec (power in kW → W)', () => {
    const s = buildCustomSpec({ ...DEFAULT_CUSTOM, torque: 1e9, power: 1 });
    expect(s.drive.maxTorque).toBe(CUSTOM_LIMITS.torque[1]);
    expect(s.drive.maxPower).toBe(CUSTOM_LIMITS.power[0] * 1000);
    expect(buildCustomSpec(DEFAULT_CUSTOM).drive).toMatchObject({ maxTorque: 2400, maxPower: 360_000 });
  });
  it('more power → higher top speed, more torque alone does not', () => {
    const base = topSpeed(buildCustomSpec(DEFAULT_CUSTOM));
    expect(topSpeed(buildCustomSpec({ ...DEFAULT_CUSTOM, power: 600 }))).toBeGreaterThan(base * 1.1);
    expect(topSpeed(buildCustomSpec({ ...DEFAULT_CUSTOM, torque: 6000 }))).toBeCloseTo(base, 0);
  });
});

describe('custom wheelspin field', () => {
  it('sets the slip limit, clamped to its range', () => {
    expect(buildCustomSpec({ ...DEFAULT_CUSTOM, wheelspin: 10 }).drive.maxSlipSpeed).toBe(10);
    expect(buildCustomSpec({ ...DEFAULT_CUSTOM, wheelspin: 99 }).drive.maxSlipSpeed).toBe(CUSTOM_LIMITS.wheelspin[1]);
    expect(buildCustomSpec({ ...DEFAULT_CUSTOM, wheelspin: 0 }).drive.maxSlipSpeed).toBe(CUSTOM_LIMITS.wheelspin[0]);
  });
});
