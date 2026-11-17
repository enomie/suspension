import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { UNIT_TORUS_GEOMETRY } from '../src/render/geometries/unitGeometries';
import { torusAxialScale, torusHullBorder, torusHullPoints, torusWheelWidth } from '../src/shared/unitTorus';
import { moped, motorcycle } from '../src/physics/vehicle/presets/motorcycle';
import { createWheel } from '../src/physics/vehicle/parts/wheel';

await RAPIER.init();

describe('torus wheel (apokalypto wheel-bike)', () => {
  it('hull points are exactly the unit torus mesh vertices (three.js TorusGeometry), axle on X', () => {
    const pos = UNIT_TORUS_GEOMETRY.attributes.position;
    const pts = torusHullPoints(1);
    const wide = torusHullPoints(2, 0.5);
    expect(pts.length).toBe(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // (x, y, z) → (z, y, −x)
      expect(pts[i * 3]).toBeCloseTo(pos.getZ(i), 5);
      expect(pts[i * 3 + 1]).toBeCloseTo(pos.getY(i), 5);
      expect(pts[i * 3 + 2]).toBeCloseTo(-pos.getX(i), 5);
      // separate axial scale: only the axle (X) component changes
      expect(wide[i * 3]).toBeCloseTo(pos.getZ(i) * 0.5, 5);
      expect(wide[i * 3 + 1]).toBeCloseTo(pos.getY(i) * 2, 5);
    }
  });

  it('border follows apokalypto: 11 % of the tube radius, clamped 3.5…26 mm', () => {
    expect(torusHullBorder(0.62)).toBeCloseTo(0.11 * 0.15 * 0.62, 6);
    expect(torusHullBorder(0.001)).toBeCloseTo(0.0035, 6);
    expect(torusHullBorder(100)).toBeCloseTo(0.026, 6);
  });

  it('motorcycle: torus wheels at the apokalypto default width 0.6·radius', () => {
    for (const a of motorcycle.axles) {
      expect(a.wheel.shape).toBe('torus');
      expect(a.wheel.width).toBeCloseTo(torusWheelWidth(a.wheel.radius), 6);
    }
  });

  it('moped: torus wheels, smaller diameter than the motorcycle but wider than the default tire', () => {
    for (const a of moped.axles) {
      expect(a.wheel.shape).toBe('torus');
      expect(a.wheel.radius).toBeLessThan(motorcycle.axles[0].wheel.radius);
      expect(a.wheel.width).toBeGreaterThan(torusWheelWidth(a.wheel.radius));
    }
  });

  it('bikes use slim springs', () => {
    expect(motorcycle.springStyle).toBe('slim');
    expect(moped.springStyle).toBe('slim');
  });

  it('collider is a round convex hull with the torus extents (+ border)', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const w = motorcycle.axles[0].wheel;
    const body = createWheel(RAPIER, world, w, { x: 0, y: 0, z: 0 });
    const col = body.collider(0);
    expect(col.shape.type).toBe(RAPIER.ShapeType.RoundConvexPolyhedron);
    const border = torusHullBorder(Math.min(w.radius * 2, torusAxialScale(w.width)));
    const aabb = col.shape as unknown as { vertices: Float32Array };
    let maxY = 0;
    let maxX = 0;
    for (let i = 0; i < aabb.vertices.length; i += 3) {
      maxX = Math.max(maxX, Math.abs(aabb.vertices[i]));
      maxY = Math.max(maxY, Math.abs(aabb.vertices[i + 1]));
    }
    expect(maxY).toBeCloseTo(w.radius, 2);
    expect(maxX).toBeCloseTo(w.width / 2, 2);
    expect((col.shape as unknown as { borderRadius: number }).borderRadius).toBeCloseTo(border, 6);
  });
});

describe('single-track wheels draw no knuckle box', () => {
  it.each([motorcycle, moped])('$name: hideKnuckle on both wheels', (spec) => {
    for (const a of spec.axles) expect(a.wheel.hideKnuckle).toBe(true);
  });
});
