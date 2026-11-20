import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { buildCustomSpec, customFromSpec, DEFAULT_CUSTOM } from '../src/shared/customVehicle';

await RAPIER.init();

const DT = 1 / 120;
const make = (colliderBox: boolean) => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, colliderBox });
  const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 0.6, z: 0 });
  return { v, spec };
};

describe('collider-lower', () => {
  it('adds one low-friction collider to the chassis, only when enabled', () => {
    const on = make(true);
    const off = make(false);
    expect(on.v.chassis.numColliders()).toBe(off.v.chassis.numColliders() + 1);
    const c = on.spec.chassis.lowerCollider!;
    const box = Array.from({ length: on.v.chassis.numColliders() }, (_, i) => on.v.chassis.collider(i)).find((k) => Math.abs(k.friction() - c.friction) < 1e-6);
    expect(box).toBeDefined();
    expect(c.friction).toBeLessThan(0.5);
  });
  it('adds no mass: the entered weight stays the total', () => {
    expect(make(true).v.chassis.mass()).toBeCloseTo(make(false).v.chassis.mass(), 3);
  });
  it('round-trips through the profile', () => {
    expect(customFromSpec(make(true).spec).colliderBox).toBe(true);
    expect(customFromSpec(make(false).spec).colliderBox).toBe(false);
  });
});
