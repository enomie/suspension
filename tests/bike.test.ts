import { afterEach, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { BikeVehicle } from '../src/physics/vehicle/bike/BikeVehicle';
import { buildBikeVehicle } from '../src/physics/vehicle/bike/buildBike';
import { createVehicle } from '../src/physics/vehicle/createVehicle';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { Simulation } from '../src/physics/Simulation';
import { ALL_PRESETS, PRESETS } from '../src/physics/vehicle/presets';
import { BIKE_PRESETS, moped, motorcycle } from '../src/physics/vehicle/presets/bike';
import {
  BIKE_LIMITS,
  bikeBalance,
  bikeComLimits,
  bikeFrameBox,
  bikeHeights,
  bikeTravel,
  bikeVehicleSpec,
  isBikeSpec,
  minBikeWheelbase,
  validateBikeSpec,
  type BikeVehicleSpec,
} from '../src/shared/bikeSpec';
import { isTrackedSpec } from '../src/shared/trackedSpec';
import { buildBikeSpec, DEFAULT_CUSTOM_BIKE, type CustomBikeConfig } from '../src/shared/customBike';
import { VEHICLE_PRESET_LABELS } from '../src/shared/vehiclePresetLabels';
import { ORIGIN } from '../src/shared/origin';
import type { DriverInput } from '../src/shared/driverInput';

await RAPIER.init();
afterEach(() => {
  ORIGIN.x = 0;
  ORIGIN.z = 0;
});

const DT = 1 / 120;
const idle: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

function setup(spec: BikeVehicleSpec) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setFriction(0.95), ground);
  // chassis origin a little above design ride: the ground line sits `-bikeHeights().ground` below the origin
  const v = new BikeVehicle(RAPIER, world, spec, { x: 0, y: -bikeHeights(spec).ground + 0.05, z: 0 });
  const run = (seconds: number, input: DriverInput = idle) => {
    for (let i = 0; i < seconds / DT; i++) {
      v.applyInput(input, DT);
      world.step();
    }
    v.updateTelemetry();
  };
  return { v, run, world };
}

const bike = (c: Partial<CustomBikeConfig>) => buildBikeSpec({ ...DEFAULT_CUSTOM_BIKE, ...c });

describe('bike presets', () => {
  it('are valid bikes, listed after the wheeled presets with their labels', () => {
    expect(BIKE_PRESETS).toEqual([motorcycle, moped]);
    BIKE_PRESETS.forEach((b, i) => {
      expect(validateBikeSpec(b)).toEqual([]);
      expect(isBikeSpec(b)).toBe(true);
      expect(isTrackedSpec(b)).toBe(false);
      expect(ALL_PRESETS[PRESETS.length + i]).toBe(b);
      expect(b.label).toBe(VEHICLE_PRESET_LABELS[PRESETS.length + i]);
    });
    expect(PRESETS.some((p) => isBikeSpec(p))).toBe(false);
  });

  it.each(BIKE_PRESETS)('$name: fork front, swingarm rear, torus tires, no ladder frame', (b) => {
    const w = bikeVehicleSpec(b);
    expect(w.axles.map((a) => a.suspension)).toEqual(['telescopicFork', 'swingArm']);
    expect(w.axles.map((a) => a.track)).toEqual([0, 0]);
    for (const a of w.axles) expect(a.wheel).toMatchObject({ shape: 'torus', hideKnuckle: true });
    expect(w.axles[0].steer).toBeDefined();
    expect(w.axles[1].drive?.share).toBe(1);
    expect(w.axles[1].handbrake?.torque).toBe(b.rearBrakeTorque);
    expect(w.chassis.frame).toBe(false);
    // weight is the total: sprung mass + both wheels
    expect(w.chassis.mass + b.front.mass + b.rear.mass).toBeCloseTo(b.mass, 9);
  });

  it('createVehicle builds a BikeVehicle for a bike spec, a Vehicle for a wheeled one', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    expect(createVehicle(RAPIER, world, motorcycle, { x: 0, y: 1, z: 0 })).toBeInstanceOf(BikeVehicle);
    expect(createVehicle(RAPIER, world, PRESETS[0], { x: 10, y: 1, z: 0 })).toBeInstanceOf(Vehicle);
  });
});

describe('bike spec rules', () => {
  it('rejects wheels that do not fit the wheelbase, tires outside their width share, wheels heavier than the bike', () => {
    const big = { ...motorcycle.front, radius: 0.6, width: 0.36 };
    expect(validateBikeSpec({ ...motorcycle, front: big, rear: big }).some((e) => e.includes('too short'))).toBe(true);
    expect(validateBikeSpec({ ...motorcycle, front: { ...motorcycle.front, width: 0.05 } }).some((e) => e.includes('width per radius'))).toBe(true);
    expect(validateBikeSpec({ ...motorcycle, mass: 20 }).some((e) => e.includes('larger than both wheels'))).toBe(true);
    expect(validateBikeSpec({ ...motorcycle, wheelbase: 4 }).some((e) => e.startsWith('wheelbase'))).toBe(true);
  });

  it('keeps the center of mass inside the wheelbase, near the center plane and above the ground', () => {
    const L = bikeComLimits(motorcycle);
    expect(L.z[0]).toBeGreaterThan(-motorcycle.wheelbase / 2);
    expect(L.z[1]).toBeLessThan(motorcycle.wheelbase / 2);
    expect(L.y[0]).toBeGreaterThan(bikeHeights(motorcycle).ground);
    expect(validateBikeSpec({ ...motorcycle, comOffset: [0, 0, 0.7] }).some((e) => e.startsWith('comOffset z'))).toBe(true);
    expect(validateBikeSpec({ ...motorcycle, comOffset: [0.2, 0, 0] }).some((e) => e.startsWith('comOffset x'))).toBe(true);
  });

  it('builder throws on an invalid spec', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    expect(() => buildBikeVehicle(RAPIER, world, { ...motorcycle, wheelbase: 0.6 }, { x: 0, y: 1, z: 0 })).toThrow(/too short/);
  });

  it('stand stiffness follows the tipping torque m·g·h: a higher center of mass gets a stiffer stand', () => {
    const low = bikeBalance({ ...motorcycle, comOffset: [0, -0.3, 0] });
    const high = bikeBalance({ ...motorcycle, comOffset: [0, 0.3, 0] });
    expect(high.standStiffness).toBeGreaterThan(low.standStiffness * 1.5);
    expect(bikeBalance({ ...motorcycle, mass: 360 }).standStiffness).toBeGreaterThan(bikeBalance(motorcycle).standStiffness * 1.9);
    expect(bikeBalance(motorcycle).comLean).toBe(0);
    expect(bikeBalance({ ...motorcycle, comOffset: [0.05, -0.1, 0.05] }).comLean).toBeGreaterThan(0);
  });
});

describe('bike geometry across the limits', () => {
  const radii = [0.1, 0.3, 0.6, 1];
  const shapes = radii.flatMap((rf) => radii.flatMap((rr) => [minBikeWheelbase(rf, rr), BIKE_LIMITS.wheelbase[1]].filter((wb) => wb <= BIKE_LIMITS.wheelbase[1]).map((wb) => ({ rf, rr, wb }))));

  it.each(shapes)('front $rf m, rear $rr m, wheelbase $wb m: wheels apart, frame box clear of both tires', ({ rf, rr, wb }) => {
    const spec = bike({ wheelbase: wb, front: { radius: rf, width: 0.6 * rf }, rear: { radius: rr, width: 0.6 * rr } });
    expect(validateBikeSpec(spec)).toEqual([]);
    const front = -wb / 2;
    const rear = wb / 2;
    expect(rear - rr).toBeGreaterThan(front + rf);
    const box = bikeFrameBox(spec);
    const boxFront = box.position[2] - box.size[2] / 2;
    const boxRear = box.position[2] + box.size[2] / 2;
    // front tire moves back by travel·tan(rake) when the fork is fully compressed
    expect(boxFront).toBeGreaterThan(front + rf + bikeTravel(rf) * Math.tan(0.45));
    expect(boxRear).toBeLessThan(rear - rr);
    expect(box.position[1] - box.size[1] / 2).toBeGreaterThan(bikeHeights(spec).ground);
  });

  it.each(shapes)('front $rf m, rear $rr m, wheelbase $wb m: fork legs and clamp clear of the tire, swingarm pivot between the tires', ({ rf, rr, wb }) => {
    const spec = bike({ wheelbase: wb, front: { radius: rf, width: 0.8 * rf }, rear: { radius: rr, width: 0.8 * rr } });
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const built = buildBikeVehicle(RAPIER, world, spec, { x: 0, y: 0, z: 0 });
    const [frontCorner, rearCorner] = built.corners;
    const wc = frontCorner.wheel.translation();
    const points = frontCorner.visuals.flatMap((l) => [l.a, l.b]).map((a) => {
      const t = a.body.translation();
      return { x: t.x + a.local[0], y: t.y + a.local[1] };
    });
    // every fork part off the center line sits outside the tire
    for (const p of points.filter((p) => Math.abs(p.x) > 1e-6)) expect(Math.abs(p.x)).toBeGreaterThan(spec.front.width / 2);
    // the triple clamp (highest point) sits above the tire
    expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(wc.y + rf);
    // swingarm pivot: ahead of the rear tire, behind the front tire
    const armLength = bikeVehicleSpec(spec).axles[1].armLength!;
    const pivotZ = rearCorner.wheel.translation().z - armLength;
    expect(pivotZ).toBeGreaterThan(wc.z + rf);
    expect(armLength).toBeGreaterThan(rr);
  });
});

describe('bike balance at the extremes', () => {
  /** sensible engines for the odd sizes: 350 N·m on a 0.1 m wheel would flip a 30 kg bike over backwards */
  const cases: [string, BikeVehicleSpec][] = [
    ['default', bike({})],
    ['smallest', bike({ wheelbase: 0.5, front: { radius: 0.1, width: 0.06 }, rear: { radius: 0.1, width: 0.06 }, weight: 30, torque: 20, power: 2 })],
    ['largest', bike({ wheelbase: 3, front: { radius: 1, width: 0.6 }, rear: { radius: 1, width: 0.6 }, weight: 2000, torque: 5000, power: 500 })],
    ['center of mass off to the side', bike({ comOffset: [0.05, -0.1, 0.05] })],
    ['high center of mass', bike({ comOffset: [0, 0.6, 0] })],
    ['big front, small rear wheel', bike({ front: { radius: 0.5, width: 0.3 }, rear: { radius: 0.2, width: 0.12 } })],
    ['moped with a 0.6 m front wheel', bike({ wheelbase: 0.5, front: { radius: 0.6, width: 0.19 }, rear: { radius: 0.24, width: 0.19 }, weight: 110, torque: 110, power: 13 })],
  ];

  it.each(cases)('%s: the stand holds it upright at rest, near design ride height', (_n, spec) => {
    const { v, run } = setup(spec);
    run(5);
    expect(Math.abs(v.balance.lean)).toBeLessThan(0.05);
    for (const c of v.corners) expect(Math.abs(c.telemetry.travel)).toBeLessThan(0.2 * bikeTravel(c.axle.wheel.radius) + 0.005);
    const lv = v.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.1);
  });

  it.each(cases)('%s: rides straight, leans into a left turn and comes back', (_n, spec) => {
    const { v, run } = setup(spec);
    run(2);
    let worst = 0;
    for (let i = 0; i < 6; i++) {
      run(1, { ...idle, throttle: 1 });
      worst = Math.max(worst, Math.abs(v.balance.lean));
    }
    expect(v.forwardSpeed).toBeGreaterThan(3);
    expect(worst).toBeLessThan(0.15);
    let minLean = 0;
    for (let i = 0; i < 20; i++) {
      run(0.1, { ...idle, throttle: 1, steer: 0.6 });
      minLean = Math.min(minLean, v.balance.lean);
    }
    expect(minLean).toBeLessThan(-0.1); // left = negative
    expect(v.chassis.translation().x).toBeLessThan(-0.5);
    run(5, { ...idle, throttle: 1 });
    expect(Math.abs(v.balance.lean)).toBeLessThan(0.15);
  });
});

describe('center of mass along the bike', () => {
  /** the largest lift of the front and the rear wheel above their resting height during `seconds` of `input` [m] */
  function lift(spec: BikeVehicleSpec, input: DriverInput, runUp: number, seconds = 1) {
    const { v, run } = setup(spec);
    run(3);
    if (runUp) run(runUp, { ...idle, throttle: 1 });
    const f0 = v.corners[0].wheel.translation().y;
    const r0 = v.corners[1].wheel.translation().y;
    let front = 0;
    let rear = 0;
    for (let i = 0; i < seconds / DT; i++) {
      run(DT, input);
      front = Math.max(front, v.corners[0].wheel.translation().y - f0);
      rear = Math.max(rear, v.corners[1].wheel.translation().y - r0);
    }
    return { front, rear };
  }
  const strong = { torque: 2000, power: 200, wheelspin: 15 };

  it('far back + strong engine: wheelie on plain throttle', () => {
    expect(lift(bike({ ...strong, comOffset: [0, 0.3, 0.45] }), { ...idle, throttle: 1 }, 0).front).toBeGreaterThan(0.1);
  });

  it.each(BIKE_PRESETS)('$name: half a second of Shift from standstill lifts the front, plain throttle does not', (spec) => {
    expect(lift(spec, { ...idle, throttle: 1, boost: true }, 0, 0.5).front).toBeGreaterThan(0.1);
    expect(lift(spec, { ...idle, throttle: 1 }, 0).front).toBeLessThan(0.05);
  });

  it('a low center of mass cannot wheelie even on Shift: the rear tire slips first (d / h above the friction)', () => {
    const low = { ...motorcycle, comOffset: [0, -0.1, 0.05] as [number, number, number] };
    expect(lift(low, { ...idle, throttle: 1, boost: true }, 0, 0.5).front).toBeLessThan(0.05);
  });

  it('far forward + full brake: stoppie; the default center of mass keeps the rear down', () => {
    expect(lift(bike({ comOffset: [0, 0.3, -0.45] }), { ...idle, brake: 1 }, 5).rear).toBeGreaterThan(0.1);
    expect(lift(bike({}), { ...idle, brake: 1 }, 5).rear).toBeLessThan(0.1);
  });
});

describe('single-sided swingarm', () => {
  it('both presets: the arm leg runs on the right of the wheel only, the shock stays on the center plane', () => {
    for (const spec of BIKE_PRESETS) {
      expect(bikeVehicleSpec(spec).axles[1].swingArmSide).toBe('right');
      const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      const rear = buildBikeVehicle(RAPIER, world, spec, { x: 0, y: 0, z: 0 }).corners[1];
      const x = (a: { body: { translation(): { x: number } }; local: number[] }) => a.body.translation().x + a.local[0];
      const beams = rear.visuals.filter((l) => l.kind === 'beam');
      expect(beams).toHaveLength(1);
      for (const b of beams) for (const end of [b.a, b.b]) expect(x(end)).toBeGreaterThan(spec.rear.width / 2);
      for (const l of rear.visuals.filter((l) => l.kind === 'spring' || l.kind === 'damper')) for (const end of [l.a, l.b]) expect(x(end)).toBeCloseTo(0, 6);
    }
  });
});

describe('bike frame collider', () => {
  it('collider box on: one low-friction frame box on the chassis; off: none (only the tires collide)', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const on = buildBikeVehicle(RAPIER, world, motorcycle, { x: 0, y: 0, z: 0 }).chassis;
    expect(on.numColliders()).toBe(1);
    expect(on.collider(0).friction()).toBeCloseTo(bikeFrameBox(motorcycle).friction, 6);
    const off = buildBikeVehicle(RAPIER, world, { ...motorcycle, colliderBox: false }, { x: 5, y: 0, z: 0 }).chassis;
    expect(off.numColliders()).toBe(0);
    world.step(); // Rapier applies the explicit mass properties on the next step
    for (const body of [on, off]) expect(body.mass()).toBeCloseTo(motorcycle.mass - motorcycle.front.mass - motorcycle.rear.mass, 3);
  });
});

describe('bike in the simulation', () => {
  it('spawns a bike preset by index and a custom bike, the layout carries the bike spec', () => {
    const sim = new Simulation(RAPIER, { preset: PRESETS.length, x: 0, z: 0 });
    expect(sim.layout.bike).toBe(motorcycle);
    expect(sim.layout.tracked).toBeUndefined();
    expect(sim.layout.corners.map((c) => c.side)).toEqual(['C', 'C']);
    expect(sim.layout.spec.axles.map((a) => a.suspension)).toEqual(['telescopicFork', 'swingArm']);
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.snapshot(0).length).toBeGreaterThan(0);
    sim.spawn(-1, buildBikeSpec(DEFAULT_CUSTOM_BIKE));
    expect(sim.preset).toBe(-1);
    expect(sim.layout.bike?.name).toBe('custom');
    sim.spawn(0);
    expect(sim.layout.bike).toBeUndefined();
  });
});
