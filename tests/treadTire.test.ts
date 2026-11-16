import { describe, expect, it } from 'vitest';
import { createTreadTireGeometry, treadFor } from '../src/render/vehicle/treadTire';
import { moped, motorcycle } from '../src/physics/vehicle/presets/motorcycle';

describe.each([
  ['motorcycle', motorcycle.axles[0].wheel],
  ['moped', moped.axles[0].wheel],
])('tread tire %s', (_n, wheel) => {
  const geo = createTreadTireGeometry(wheel);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;

  it('is marked as tread tire', () => expect(wheel.tire).toBe('tread'));

  it('has the wheel radius and width, axle along X', () => {
    expect(bb.max.x - bb.min.x).toBeCloseTo(wheel.width, 1);
    // blocks are boxes, so the corner of a block can reach a little beyond the circle
    expect(bb.max.y).toBeGreaterThan(wheel.radius * 0.97);
    expect(bb.max.y).toBeLessThan(wheel.radius * 1.03);
    expect(bb.max.z).toBeGreaterThan(wheel.radius * 0.97);
    expect(bb.max.z).toBeLessThan(wheel.radius * 1.03);
  });

  it('has a rounded cross-section: outer rows sit lower than the center row', () => {
    const t = treadFor(wheel);
    expect(t.rows).toBeGreaterThanOrEqual(3);
    expect(t.crown).toBeGreaterThan(0);
  });

  it('is one cached buffer', () => expect(createTreadTireGeometry(wheel)).toBe(geo));
});
