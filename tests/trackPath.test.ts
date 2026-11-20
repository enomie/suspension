import { describe, expect, it } from 'vitest';
import { lowerRunPath, lowerRunY, samplePath, type PathCircle } from '../src/shared/trackPath';

const wheel = (z: number, y = 0, radius = 0.3): PathCircle => ({ z, y, radius });

describe('lower run path', () => {
  it('equal wheels at one height: flat run at the bottom, tangent points straight below the centres', () => {
    const path = lowerRunPath([wheel(-2), wheel(-1), wheel(0), wheel(1)]);
    expect(lowerRunY(path, -0.5)).toBeCloseTo(-0.3, 9);
    expect(lowerRunY(path, 0.4)).toBeCloseTo(-0.3, 9);
    const b = path.filter((p) => p.circle === 1).map((p) => p.z);
    expect(Math.min(...b)).toBeCloseTo(-1, 9); // entry and exit coincide at the bottom
  });

  it('every tangent point lies on its circle with the radius perpendicular to the chain', () => {
    const circles = [wheel(-2, 0.2), wheel(-1, 0.0), wheel(0, -0.1), wheel(1, 0.3)];
    const path = lowerRunPath(circles);
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (a.circle === b.circle) continue; // a straight piece joins two circles
      const dz = b.z - a.z;
      const dy = b.y - a.y;
      for (const p of [a, b]) {
        const c = circles[p.circle];
        expect(Math.hypot(p.z - c.z, p.y - c.y)).toBeCloseTo(c.radius, 9);
        expect(((p.z - c.z) * dz + (p.y - c.y) * dy) / Math.hypot(dz, dy)).toBeCloseTo(0, 9); // radius ⟂ chain
      }
    }
  });

  it('a wheel higher than its neighbours (something is under it): the chain still goes under it', () => {
    const circles = [wheel(-1, 0), wheel(0, 0.3), wheel(1, 0)];
    const path = lowerRunPath(circles);
    // it touches the high wheel at its bottom, so it climbs there (the line wheel 1 → wheel 3 would run 0.3 m lower)
    expect(lowerRunY(path, 0)).toBeCloseTo(0.3 - 0.3, 6);
    expect(lowerRunY(path, 0)).toBeGreaterThan(lowerRunY(path, -0.6) - 1e-9);
  });

  it('different radii: tangent still touches both circles', () => {
    const circles = [{ z: -1, y: 0, radius: 0.2 }, { z: 0, y: -0.1, radius: 0.4 }];
    const path = lowerRunPath(circles);
    for (const p of path.filter((q) => q.circle >= 0)) {
      const c = circles[p.circle];
      expect(Math.hypot(p.z - c.z, p.y - c.y)).toBeCloseTo(c.radius, 9);
    }
  });

  it('runs front to rear: z never decreases, s grows', () => {
    const path = lowerRunPath([wheel(-2.4, -0.25, 0.25), wheel(-1.5), wheel(-0.5, 0.2), wheel(0.5), wheel(1.5), wheel(2.4, -0.2, 0.3)]);
    for (let i = 1; i < path.length; i++) {
      expect(path[i].z).toBeGreaterThanOrEqual(path[i - 1].z - 1e-9);
      expect(path[i].s).toBeGreaterThan(path[i - 1].s);
    }
  });

  it('samples at equal spacing and marks the arcs of the inner wheels and their surroundings', () => {
    const path = lowerRunPath([wheel(-2), wheel(-1), wheel(0), wheel(1)]);
    const samples = samplePath(path, 0.2, 0.12);
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.some((s) => s.atWheel)).toBe(true);
    expect(samples.some((s) => !s.atWheel)).toBe(true);
    // z = −1 is the bottom of an inner wheel: marked
    const near = samples.reduce((a, b) => (Math.abs(b.z + 1) < Math.abs(a.z + 1) ? b : a));
    expect(near.atWheel).toBe(true);
  });
});
