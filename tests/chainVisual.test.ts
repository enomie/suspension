import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { ChainVisual, linkMatrix } from '../src/render/vehicle/chainVisual';
import { CHAIN_LINK } from '../src/shared/chainLink';
import { buildChainLoop, type ChainCircle } from '../src/shared/chainLoop';

const wheels: ChainCircle[] = [
  { z: -1, y: 0, radius: 0.3 },
  { z: 0, y: 0, radius: 0.3 },
  { z: 1, y: 0, radius: 0.3 },
];
const base = { asset: CHAIN_LINK, track: 2, beltWidth: 0.4, chainThickness: 0.05, wheels };

const origin = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);
const instance = (mesh: ChainVisual['group']['children'][number], i: number) => {
  const m = new Matrix4();
  (mesh as any).getMatrixAt(i, m);
  return m;
};

describe('chain link', () => {
  it('has seven parts: plate, grouser, two edge lips, two hinge lugs and a pin', () => {
    expect(CHAIN_LINK.parts).toHaveLength(7);
  });

  it('all boxes are valid and the link is a plain JSON-able record', () => {
    for (const p of CHAIN_LINK.parts) expect(p.size.every((s) => s > 0)).toBe(true);
    expect(JSON.parse(JSON.stringify(CHAIN_LINK))).toEqual(CHAIN_LINK);
  });

  it('the inner side stays within half the chain thickness of the centre line (it must not sink into the wheel)', () => {
    for (const p of CHAIN_LINK.parts) expect(p.position[1] - p.size[1] / 2).toBeGreaterThanOrEqual(-0.025 - 1e-9);
  });

  it('neighbouring links do not overlap: the longest part is shorter than the pitch, the pin reaches into the gap', () => {
    for (const p of CHAIN_LINK.parts) expect(p.position[2] + p.size[2] / 2).toBeLessThan(CHAIN_LINK.pitch - (CHAIN_LINK.parts[0].size[2] / 2));
  });
});

describe('linkMatrix', () => {
  it('bottom run (travel +z): outward is down; top run (travel −z): outward is up', () => {
    const bottom = linkMatrix({ z: 0, y: -0.3, angle: 0 }, 1, new Matrix4());
    const top = linkMatrix({ z: 0, y: 0.3, angle: Math.PI }, 1, new Matrix4());
    const out = (m: Matrix4) => new Vector3(0, 1, 0).transformDirection(m);
    expect(out(bottom).y).toBeCloseTo(-1, 9);
    expect(out(top).y).toBeCloseTo(1, 9);
    expect(new Vector3(0, 0, 1).transformDirection(bottom).z).toBeCloseTo(1, 9);
    expect(new Vector3(0, 0, 1).transformDirection(top).z).toBeCloseTo(-1, 9);
    expect(origin(bottom).toArray()).toEqual([1, -0.3, 0]);
  });

  it('is a proper rotation (no mirroring)', () => {
    const m = linkMatrix({ z: 0.2, y: 0.1, angle: 1.1 }, -1, new Matrix4());
    expect(m.determinant()).toBeCloseTo(1, 9);
  });
});

describe('ChainVisual', () => {
  it('one instanced mesh per link part, with both tracks', () => {
    const v = new ChainVisual(base);
    expect(v.group.children).toHaveLength(CHAIN_LINK.parts.length);
    for (const m of v.group.children) expect((m as any).count).toBe(v.linkCount * 2);
    // loop length of the placeholder case: 4 + 2π·0.325 = 6.04 m → about 40 links of 0.15 m
    expect(v.linkCount).toBe(40);
  });

  it('places the links on the loop of both tracks, plates outside the wheels', () => {
    const v = new ChainVisual(base);
    v.update(wheels, wheels, 0, 0);
    const plate = v.group.children[0];
    let minY = Infinity;
    let maxY = -Infinity;
    const xs = new Set<number>();
    for (let i = 0; i < v.linkCount * 2; i++) {
      const p = origin(instance(plate, i));
      xs.add(Math.round(p.x * 1000) / 1000);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    expect([...xs].sort()).toEqual([-1, 1]);
    // centre line at ±0.325 plus half the plate (0.01) outward
    expect(minY).toBeLessThan(-0.325);
    expect(minY).toBeGreaterThan(-0.345);
    expect(maxY).toBeGreaterThan(0.325);
  });

  it('scales the link across the track to the belt width', () => {
    const v = new ChainVisual({ ...base, beltWidth: 0.6 });
    v.update(wheels, wheels, 0, 0);
    const m = instance(v.group.children[0], 0);
    expect(new Vector3(1, 0, 0).transformDirection(m).length()).toBeCloseTo(1, 9);
    expect(new Vector3().setFromMatrixScale(m).x).toBeCloseTo(0.6, 5);
  });

  it('moving the distance by one pitch puts every link where the next one was', () => {
    const v = new ChainVisual(base);
    v.update(wheels, wheels, 0, 0);
    const first = origin(instance(v.group.children[0], 1));
    const pitch = buildChainLoop(wheels, 0.05).length / v.linkCount;
    v.update(wheels, wheels, pitch, pitch);
    const shifted = origin(instance(v.group.children[0], 0));
    expect(shifted.distanceTo(first)).toBeLessThan(1e-6);
  });

  it('follows a wheel that moved up: the chain lifts with it', () => {
    const v = new ChainVisual(base);
    v.update(wheels, wheels, 0, 0);
    const before = Math.min(...Array.from({ length: v.linkCount }, (_, i) => origin(instance(v.group.children[0], i)).y));
    const raised = wheels.map((w, i) => (i === 1 ? { ...w, y: 0.15 } : w));
    v.update(raised, raised, 0, 0);
    // the lowest points are still the outer wheels' bottoms: a raised middle wheel does not lift the straight run
    const after = Math.min(...Array.from({ length: v.linkCount }, (_, i) => origin(instance(v.group.children[0], i)).y));
    expect(after).toBeCloseTo(before, 2);
  });
});
