import { describe, expect, it } from 'vitest';
import { buildChainLoop, linkLayout, type ChainCircle, type ChainPose } from '../src/shared/chainLoop';

const circle = (z: number, y: number, radius: number): ChainCircle => ({ z, y, radius });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('buildChainLoop length', () => {
  it('two equal wheels: 2·π·r + 2·distance (centre line radius includes half the chain thickness)', () => {
    const loop = buildChainLoop([circle(-1, 0, 0.3), circle(1, 0, 0.3)], 0.1);
    expect(loop.length).toBeCloseTo(2 * Math.PI * 0.35 + 2 * 2, 9);
  });

  it('wheels in a row add nothing: the road wheels between idler and sprocket are on the straight runs', () => {
    const two = buildChainLoop([circle(-2, 0, 0.3), circle(2, 0, 0.3)], 0);
    const five = buildChainLoop([-2, -1, 0, 1, 2].map((z) => circle(z, 0, 0.3)), 0);
    expect(five.length).toBeCloseTo(two.length, 9);
    expect(five.wrapped).toEqual([0, 4]);
  });

  it('raised idler and sprocket give a triangular profile: perimeter of the centre triangle + 2π·r', () => {
    const a = circle(-2, 0.8, 0.3); // raised idler
    const b = circle(0, 0, 0.3); // road wheel
    const c = circle(2, 0.8, 0.3); // raised sprocket
    const loop = buildChainLoop([a, b, c], 0);
    const perimeter = 2 * Math.hypot(2, 0.8) + 4;
    expect(loop.length).toBeCloseTo(perimeter + 2 * Math.PI * 0.3, 9);
    expect(loop.wrapped.length).toBe(3);
  });

  it('a wheel inside the hull is skipped', () => {
    const big = buildChainLoop([circle(-2, 0, 0.5), circle(2, 0, 0.5)], 0);
    const withInner = buildChainLoop([circle(-2, 0, 0.5), circle(0, 0.1, 0.1), circle(2, 0, 0.5)], 0);
    expect(withInner.length).toBeCloseTo(big.length, 9);
    expect(withInner.wrapped).not.toContain(1);
  });

  it('wheels of different radius: one outer tangent each side', () => {
    const r1 = 0.5;
    const r2 = 0.2;
    const d = 2;
    const loop = buildChainLoop([circle(0, 0, r1), circle(d, 0, r2)], 0);
    const phi = Math.acos((r1 - r2) / d);
    const tangent = Math.sqrt(d * d - (r1 - r2) ** 2);
    expect(loop.length).toBeCloseTo(2 * tangent + 2 * (Math.PI - phi) * r1 + 2 * phi * r2, 9);
  });

  it('a single wheel is a circle', () => {
    expect(buildChainLoop([circle(0, 0, 0.4)], 0).length).toBeCloseTo(2 * Math.PI * 0.4, 9);
  });

  it('needs at least one wheel', () => {
    expect(() => buildChainLoop([], 0.05)).toThrow();
  });
});

describe('buildChainLoop poses', () => {
  const wheels = [circle(-2, 0.5, 0.3), circle(-1, 0, 0.3), circle(1, 0, 0.3), circle(2, 0.6, 0.35)];
  const loop = buildChainLoop(wheels, 0.06);

  it('lower run travels toward +z, upper run toward −z (top versus bottom is the same link upside down)', () => {
    let lowest: ChainPose | undefined;
    let highest: ChainPose | undefined;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const p = loop.at((i / n) * loop.length);
      if (!lowest || p.y < lowest.y) lowest = { ...p };
      if (!highest || p.y > highest.y) highest = { ...p };
    }
    expect(Math.cos(lowest!.angle)).toBeGreaterThan(0.99);
    expect(Math.cos(highest!.angle)).toBeLessThan(-0.99);
    // lowest point = bottom of a road wheel plus the chain: y = −r − t
    expect(lowest!.y).toBeCloseTo(-0.3 - 0.03, 3);
  });

  it('is a continuous closed curve: steps of ds move the point by ds, the angle turns smoothly, the end meets the start', () => {
    const n = 2000;
    const ds = loop.length / n;
    let prev = loop.at(0, { z: 0, y: 0, angle: 0 });
    const p0 = { ...prev };
    for (let i = 1; i <= n; i++) {
      const p = loop.at(i * ds);
      expect(Math.hypot(p.z - prev.z, p.y - prev.y)).toBeLessThanOrEqual(ds + 1e-9);
      expect(Math.abs(wrap(p.angle - prev.angle))).toBeLessThan(0.1);
      prev = { ...p };
    }
    expect(prev.z).toBeCloseTo(p0.z, 6);
    expect(prev.y).toBeCloseTo(p0.y, 6);
  });

  it('wraps: distance and distance + length give the same pose, negative distances work', () => {
    const a = loop.at(1.234);
    const b = loop.at(1.234 + loop.length);
    const c = loop.at(1.234 - loop.length);
    for (const p of [b, c]) {
      expect(p.z).toBeCloseTo(a.z, 9);
      expect(p.y).toBeCloseTo(a.y, 9);
    }
  });

  it('the outer side of the chain is to the right of the travel direction (outside the hull)', () => {
    const cz = wheels.reduce((s, w) => s + w.z, 0) / wheels.length;
    const cy = wheels.reduce((s, w) => s + w.y, 0) / wheels.length;
    for (let i = 0; i < 50; i++) {
      const p = loop.at((i / 50) * loop.length);
      const rz = Math.sin(p.angle); // right-hand normal of (cos, sin)
      const ry = -Math.cos(p.angle);
      expect((p.z - cz) * rz + (p.y - cy) * ry).toBeGreaterThan(0);
    }
  });
});

describe('linkLayout', () => {
  it('fits a whole number of links to the loop, pitch stays close to nominal', () => {
    const l = linkLayout(10.37, 0.2);
    expect(Number.isInteger(l.count)).toBe(true);
    expect(l.count * l.pitch).toBeCloseTo(10.37, 9);
    expect(Math.abs(l.pitch - 0.2) / 0.2).toBeLessThan(0.02);
  });

  it('has at least 3 links and rejects a bad pitch', () => {
    expect(linkLayout(0.1, 1).count).toBe(3);
    expect(() => linkLayout(5, 0)).toThrow();
  });
});
