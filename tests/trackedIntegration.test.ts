import { afterEach, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Simulation } from '../src/physics/Simulation';
import { ALL_PRESETS, PRESETS } from '../src/physics/vehicle/presets';
import { tank } from '../src/physics/vehicle/presets/tracked';
import { VehicleVisual } from '../src/render/vehicle';
import { VEHICLE_PRESET_LABELS } from '../src/shared/vehiclePresetLabels';
import { isTrackedSpec, validateTrackedSpec, designChainWheels } from '../src/shared/trackedSpec';
import { buildChainLoop } from '../src/shared/chainLoop';
import { ORIGIN } from '../src/shared/origin';
import { neutralInput } from '../src/shared/driverInput';

await RAPIER.init();
afterEach(() => {
  ORIGIN.x = 0;
  ORIGIN.z = 0;
});

const TRACKED_INDEX = PRESETS.length;

describe('tracked preset', () => {
  it('is valid and listed after the wheeled presets with its own label', () => {
    expect(validateTrackedSpec(tank)).toEqual([]);
    expect(ALL_PRESETS[TRACKED_INDEX]).toBe(tank);
    expect(isTrackedSpec(tank)).toBe(true);
    expect(isTrackedSpec(PRESETS[0])).toBe(false);
    expect(VEHICLE_PRESET_LABELS).toHaveLength(ALL_PRESETS.length);
    expect(VEHICLE_PRESET_LABELS[TRACKED_INDEX]).toBe('Tracked vehicle');
  });

  it('the chain around the design wheels is a closed loop with a raised sprocket', () => {
    const loop = buildChainLoop(designChainWheels(tank), tank.chainThickness);
    expect(loop.length).toBeGreaterThan(8);
    expect(loop.wrapped[0]).toBeDefined();
  });
});

describe('tracked vehicle in the simulation', () => {
  it('spawns from the preset index, describes a layout for rendering and snapshots it', () => {
    const sim = new Simulation(RAPIER, { preset: TRACKED_INDEX, x: 0, z: 0 });
    expect(sim.layout.tracked).toBe(tank);
    expect(sim.layout.corners).toHaveLength(8);
    expect(sim.layout.corners.map((c) => c.side)).toEqual(['L', 'R', 'L', 'R', 'L', 'R', 'L', 'R']);
    // drawn road wheel: own radius (no chain), narrower than the belt
    expect(sim.layout.corners[0].wheelSpec.radius).toBe(0.3);
    expect(sim.layout.corners[0].wheelSpec.width).toBeLessThan(tank.beltWidth);
    // the renderer's wheeled view: no steering, no drive
    expect(sim.layout.spec.axles.every((a) => !a.steer && !a.drive)).toBe(true);
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.snapshot(0).length).toBeGreaterThan(0);
  });

  it('switches between a wheeled and a tracked vehicle (spawn bumps the generation)', () => {
    const sim = new Simulation(RAPIER, { preset: 0, x: 0, z: 0 });
    expect(sim.layout.tracked).toBeUndefined();
    sim.spawn(TRACKED_INDEX);
    expect(sim.layout.tracked).toBe(tank);
    expect(sim.gen).toBe(1);
    sim.spawn(0);
    expect(sim.layout.tracked).toBeUndefined();
    sim.spawn(ALL_PRESETS.length + 5); // unknown preset: ignored
    expect(sim.gen).toBe(2);
  });

  it('accepts a tracked spec as a custom vehicle (preset −1)', () => {
    const sim = new Simulation(RAPIER, { preset: 0, x: 0, z: 0 });
    sim.spawn(-1, { ...tank, name: 'custom tank' });
    expect(sim.preset).toBe(-1);
    expect(sim.layout.tracked?.name).toBe('custom tank');
  });

  it('drives forward with throttle and turns left with steer +1', () => {
    const sim = new Simulation(RAPIER, { preset: TRACKED_INDEX, x: 0, z: 0 });
    for (let i = 0; i < 120; i++) sim.step(); // settle on the terrain
    const start = sim.vehicle.chassis.translation();
    sim.input = { ...neutralInput(), throttle: 1 };
    for (let i = 0; i < 240; i++) sim.step();
    expect(sim.vehicle.forwardSpeed).toBeGreaterThan(1.5);
    expect(sim.vehicle.chassis.translation().z).toBeLessThan(start.z - 1);

    sim.input = { ...neutralInput(), throttle: 1, steer: 1 };
    for (let i = 0; i < 240; i++) sim.step();
    const r = sim.vehicle.chassis.rotation();
    const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z));
    expect(yaw).toBeGreaterThan(0.15);
  });
});

describe('tracked vehicle visual', () => {
  it('draws idler, sprocket and chain, and the chain runs with the tracks', () => {
    const sim = new Simulation(RAPIER, { preset: TRACKED_INDEX, x: 0, z: 0 });
    const visual = new VehicleVisual(sim.layout);
    const chain = visual.chassis.getObjectByName('chain');
    expect(chain).toBeDefined();
    const names: string[] = [];
    visual.chassis.traverse((o) => names.push(o.name));
    expect(names.filter((n) => n === 'idler')).toHaveLength(2);
    expect(names.filter((n) => n === 'sprocket')).toHaveLength(2);

    for (let i = 0; i < 120; i++) sim.step();
    visual.apply(sim.snapshot(1000));
    const mesh = chain!.children[0] as any;
    const first = () => {
      const m = new (mesh.matrixWorld.constructor as any)().fromArray(mesh.instanceMatrix.array, 0);
      return [m.elements[12], m.elements[13], m.elements[14]];
    };
    const before = first();
    sim.input = { ...neutralInput(), throttle: 1 };
    for (let i = 0; i < 240; i++) sim.step();
    visual.apply(sim.snapshot(1500)); // 0.5 s later
    visual.apply(sim.snapshot(2000));
    const after = first();
    // the first link moved along the loop
    expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])).toBeGreaterThan(0.05);
  });

  it('a wheeled vehicle gets no tracked parts', () => {
    const sim = new Simulation(RAPIER, { preset: 0, x: 0, z: 0 });
    const visual = new VehicleVisual(sim.layout);
    expect(visual.chassis.getObjectByName('chain')).toBeUndefined();
  });
});
