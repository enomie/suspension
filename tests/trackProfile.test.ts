import { describe, expect, it } from 'vitest';
import { buildChainLoop, deformChainLoop } from '../src/shared/chainLoop';
import { trackLiftAt, TRACK_PROFILE_CELLS, TRACK_PROFILE_LENGTH } from '../src/shared/trackProfile';

const wheels = [-1, 0, 1].map((z) => ({ z, y: 0, radius: 0.3 }));

describe('track profile grid', () => {
  it('reads back the cell values linearly, 0 outside the grid, sides separate', () => {
    const out = new Float64Array(TRACK_PROFILE_LENGTH);
    out[TRACK_PROFILE_CELLS / 2] = 0.4; // left track, cell just behind the middle
    expect(trackLiftAt(out, 0, 0, 2.5 / TRACK_PROFILE_CELLS * 4 - 2 + 0.0, -2, 2)).toBeGreaterThanOrEqual(0);
    expect(trackLiftAt(out, 0, 0, 0.03, -2, 2)).toBeGreaterThan(0.2);
    expect(trackLiftAt(out, 0, 1, 0.03, -2, 2)).toBe(0);
    expect(trackLiftAt(out, 0, 0, 3, -2, 2)).toBe(0);
  });
});

describe('deformed chain loop', () => {
  const base = buildChainLoop(wheels, 0.1);
  it('without lift it is the same loop', () => {
    const d = deformChainLoop(base, () => 0);
    expect(d.length).toBeCloseTo(base.length, 1);
  });
  it('the lower run rises over a bump between two wheels, the upper run does not', () => {
    const bump = (z: number) => Math.max(0, 0.4 - Math.abs(z + 0.5) * 2);
    const d = deformChainLoop(base, bump);
    expect(d.length).toBeGreaterThan(base.length);
    let lowest = Infinity;
    let highest = -Infinity;
    const p = { z: 0, y: 0, angle: 0 };
    for (let s = 0; s < d.length; s += 0.02) {
      d.at(s, p);
      if (Math.abs(p.z + 0.5) < 0.05 && p.y < 0) lowest = Math.min(lowest, p.y);
      highest = Math.max(highest, p.y);
    }
    expect(lowest).toBeGreaterThan(-0.3); // bottom at −0.35 was lifted by ≈0.4
    expect(highest).toBeCloseTo(0.35, 1); // upper run unchanged
  });
});
