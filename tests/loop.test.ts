import { afterEach, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { StepClock } from '../src/shared/stepClock';
import { Simulation } from '../src/physics/Simulation';
import { OriginShifter } from '../src/shared/originShifter';
import { ORIGIN } from '../src/shared/origin';

await RAPIER.init();
afterEach(() => {
  ORIGIN.x = 0;
  ORIGIN.z = 0;
});

describe('StepClock', () => {
  it('liefert fällige Schritte nach Wanduhr', () => {
    const c = new StepClock(0, 1000 / 120);
    expect(c.due(5)).toBe(0);
    expect(c.due(17)).toBe(2);
    c.stampNext();
    c.stampNext();
    expect(c.due(17)).toBe(0);
  });
  it('zieht nach einem Hänger die Uhr nach statt aufzuholen', () => {
    const c = new StepClock(0, 1000 / 120, 6);
    expect(c.due(1000)).toBe(6);
  });
  it('gleiche Schrittzahl unabhängig von der Abfragerate', () => {
    for (const fps of [30, 60, 144, 240]) {
      const c = new StepClock(0, 1000 / 120, 100);
      let n = 0;
      for (let f = 1; f <= fps * 2; f++) {
        const k = c.due((f * 1000) / fps);
        for (let i = 0; i < k; i++) c.stampNext(), n++;
      }
      expect(Math.abs(n - 240)).toBeLessThanOrEqual(1);
    }
  });
});

describe('OriginShifter', () => {
  it('moves ORIGIN and notifies listeners only beyond the threshold', () => {
    const o = new OriginShifter();
    const got: number[][] = [];
    o.on((dx, dz) => got.push([dx, dz]));
    expect(o.update(500, 0)).toBe(false);
    expect(o.update(1200, -40)).toBe(true);
    expect(ORIGIN).toEqual({ x: 1216, z: -64 });
    expect(got).toEqual([[1216, -64]]);
  });

  it('Simulation: Shift verschiebt alle Rapier-Körper, absolute Positionen bleiben', () => {
    const sim = new Simulation(RAPIER, { preset: 0, x: 0, z: 0 });
    const before: number[][] = [];
    sim.world.forEachRigidBody((b) => before.push([b.translation().x + ORIGIN.x, b.translation().z + ORIGIN.z]));
    sim.origin.apply(1200, -50);
    const after: number[][] = [];
    sim.world.forEachRigidBody((b) => after.push([b.translation().x + ORIGIN.x, b.translation().z + ORIGIN.z]));
    expect(after.length).toBe(before.length);
    after.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(before[i][0], 3);
      expect(p[1]).toBeCloseTo(before[i][1], 3);
    });
  });
});
