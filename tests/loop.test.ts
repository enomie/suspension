import { afterEach, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { FixedStep } from '../src/app/fixedStep';
import { OriginShifter } from '../src/world/originShift';
import { ORIGIN } from '../src/world/origin';

await RAPIER.init();
afterEach(() => {
  ORIGIN.x = 0;
  ORIGIN.z = 0;
});

describe('FixedStep', () => {
  it('runs whole steps and returns the remainder as alpha', () => {
    const s = new FixedStep(1 / 120, 4);
    let n = 0;
    const a = s.advance(1 / 100, () => n++);
    expect(n).toBe(1);
    expect(a).toBeCloseTo((1 / 100 - 1 / 120) * 120, 6);
  });
  it('caps steps after a hitch', () => {
    const s = new FixedStep(1 / 120, 4);
    let n = 0;
    s.advance(1, () => n++);
    expect(n).toBe(4);
  });
  it('same total steps regardless of frame rate', () => {
    for (const fps of [30, 60, 100, 144, 240]) {
      const s = new FixedStep(1 / 120, 8);
      let n = 0;
      for (let i = 0; i < fps * 2; i++) s.advance(1 / fps, () => n++);
      expect(Math.abs(n - 240)).toBeLessThanOrEqual(1);
    }
  });
});

describe('OriginShifter', () => {
  it('moves ORIGIN, all bodies and notifies listeners; absolute positions unchanged', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(1200, 3, -40));
    const f = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1150, 0, 0));
    const o = new OriginShifter(world);
    const got: number[][] = [];
    o.on((dx, dz) => got.push([dx, dz]));
    expect(o.update(500, 0)).toBe(false);
    expect(o.update(1200, -40)).toBe(true);
    expect(ORIGIN).toEqual({ x: 1200, z: -50 });
    expect(got).toEqual([[1200, -50]]);
    expect(b.translation().x + ORIGIN.x).toBeCloseTo(1200, 6);
    expect(b.translation().z + ORIGIN.z).toBeCloseTo(-40, 6);
    expect(f.translation().x + ORIGIN.x).toBeCloseTo(1150, 6);
  });
});
