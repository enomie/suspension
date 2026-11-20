import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
// ONLY public entry points — how integration looks in another project (without worker)
import { Vehicle, PRESETS, describeLayout, poseBodies, writeVehicleSnapshot, makeCar, specFromWheelPoints, createVehicle, tank, neutralInput } from '../src/physics/vehicle';
import { VehicleVisual } from '../src/render/vehicle';
import { createTerrain, HILLS_TERRAIN } from '../src/shared/terrain';

await RAPIER.init();

describe('integration without worker (minimal example from src/docs/INTEGRATION_VEHICLE.md)', () => {
  it('custom ground + vehicle + visuals on the same thread', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    world.numSolverIterations = 8;
    // ground: a custom heightfield from the terrain generator (any source works)
    const terrain = createTerrain(HILLS_TERRAIN);
    const n = 128;
    const size = 64;
    const h = new Float32Array((n + 1) * (n + 1));
    for (let c = 0; c <= n; c++) for (let r = 0; r <= n; r++) h[c * (n + 1) + r] = terrain.height(-32 + c * 0.5, -32 + r * 0.5);
    world.createCollider(RAPIER.ColliderDesc.heightfield(n, n, h, { x: size, y: 1, z: size }).setFriction(0.95));

    const spec = PRESETS[2]; // McPherson
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: terrain.height(0, 0) + 1.2, z: 0 });
    const bodies = poseBodies(v.built);
    const visual = new VehicleVisual(describeLayout(spec, v.built));

    const input = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    for (let i = 0; i < 240; i++) {
      v.applyInput(input, 1 / 120);
      world.step();
      v.updateTelemetry();
    }
    visual.apply(writeVehicleSnapshot(v, bodies));
    expect(v.forwardSpeed).toBeGreaterThan(3);
    expect(visual.chassis.position.z).toBeLessThan(-2); // forward = −Z
    expect(visual.root.visible).toBe(true);
  });

  it('custom vehicle from makeCar (e.g. filled from an asset editor)', () => {
    const spec = makeCar('custom', 'Custom build', 'doubleWishbone');
    spec.chassis.mass = 900;
    spec.axles[0].wheel = { ...spec.axles[0].wheel, radius: 0.3 };
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0));
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 1, z: 0 });
    for (let i = 0; i < 360; i++) {
      v.applyInput({ throttle: 0, brake: 0, steer: 0, handbrake: false }, 1 / 120);
      world.step();
    }
    v.updateTelemetry();
    const lv = v.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.2);
  });
});

describe('tracked vehicle through the public entry points', () => {
  it('createVehicle builds a tracked vehicle from its spec; layout, snapshot and visual work like for a wheeled one', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    world.numSolverIterations = 8;
    world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setFriction(0.95));
    const v = createVehicle(RAPIER, world, tank, { x: 0, y: 1, z: 0 });
    const bodies = poseBodies(v.built);
    const visual = new VehicleVisual(describeLayout(tank, v.built));
    for (let i = 0; i < 480; i++) {
      v.applyInput({ ...neutralInput(), throttle: 1 }, 1 / 120);
      world.step();
      v.updateTelemetry();
    }
    visual.apply(writeVehicleSnapshot(v, bodies, { stamp: 1000 }));
    expect(v.forwardSpeed).toBeGreaterThan(2);
    expect(visual.chassis.position.z).toBeLessThan(-2);
    expect(visual.chassis.getObjectByName('chain')).toBeDefined();
  });
});

describe('chassis colliders from primitives (asset editor)', () => {
  it('box + sphere as colliders, drives and rests on flat ground', () => {
    const spec = makeCar('editor', 'Editor-Chassis', 'strut');
    spec.chassis.colliders = [
      { shape: 'box', position: [0, -0.1, 0], size: [1.0, 0.14, 4.2], rounded: 0.04 },
      { shape: 'sphere', position: [0, 0.2, -1.6], radius: 0.15 },
    ];
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0));
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 1, z: 0 });
    expect(v.chassis.numColliders()).toBe(2);
    for (let i = 0; i < 480; i++) {
      v.applyInput({ throttle: i > 240 ? 1 : 0, brake: 0, steer: 0, handbrake: false }, 1 / 120);
      world.step();
    }
    expect(v.chassis.mass()).toBeCloseTo(spec.chassis.mass, 0); // mass from spec, not from primitives
    expect(v.forwardSpeed).toBeGreaterThan(3);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.1);
  });
});

describe('specFromWheelPoints (editor with raycast wheel points)', () => {
  it('4 points → 2 axles, track, roles; vehicle rests and drives', () => {
    const { spec, warnings } = specFromWheelPoints(
      [
        { position: [-0.78, 0.0, -1.35] },
        { position: [0.78, 0.0, -1.35] },
        { position: [-0.78, 0.0, 1.35] },
        { position: [0.78, 0.0, 1.35] },
      ],
      { name: 'ed', pointIs: 'suspensionTop', restLength: 0.25 },
    );
    expect(warnings).toEqual([]);
    expect(spec.axles.length).toBe(2);
    expect(spec.axles[0].track).toBeCloseTo(1.56, 6);
    expect(spec.axles[0].y).toBeCloseTo(-0.25, 6);
    expect(spec.axles[0].steer).toBeDefined();
    expect(spec.axles[1].drive?.share).toBe(1);
    expect(spec.axles[1].handbrake).toBeDefined();

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    world.numSolverIterations = 8;
    world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0));
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 1, z: 0 });
    for (let i = 0; i < 600; i++) {
      v.applyInput({ throttle: i > 300 ? 1 : 0, brake: 0, steer: 0, handbrake: false }, 1 / 120);
      world.step();
    }
    expect(v.forwardSpeed).toBeGreaterThan(3);
  });

  it('6 wheels (truck), motorcycle single wheels, warning on asymmetry', () => {
    const truck = specFromWheelPoints(
      [-2, 1.2, 2.5].flatMap((z) => [{ position: [-1, 0, z] as [number, number, number] }, { position: [1, 0, z] as [number, number, number] }]),
      { name: 'truck', drive: [1, 2], handbrake: [1, 2] },
    ).spec;
    expect(truck.axles.map((a) => a.z)).toEqual([-2, 1.2, 2.5]);
    expect(truck.axles[1].drive?.share).toBe(0.5);

    const bike = specFromWheelPoints([{ position: [0, 0, -0.7] }, { position: [0, 0, 0.7] }], { name: 'bike' }).spec;
    expect(bike.axles.map((a) => a.track)).toEqual([0, 0]);

    const { warnings } = specFromWheelPoints(
      [{ position: [-0.7, 0, -1.3] }, { position: [0.8, 0, -1.3] }, { position: [-0.75, 0, 1.3] }, { position: [0.75, 0, 1.3] }],
      { name: 'x' },
    );
    expect(warnings.length).toBe(1);
  });
});
