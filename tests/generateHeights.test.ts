import { describe, expect, it } from 'vitest';
import { sampleTerrainHeightWorld } from '../src/shared/terrainHeight';
import { TERRAIN_NOISE } from '../src/shared/config';

describe('terrain heights', () => {
  it('stays within base elevation + amplitude, with real variation', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const h = sampleTerrainHeightWorld(((i * 37) % 400) - 200 + 0.3, ((i * 53) % 400) - 200 + 0.7);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(TERRAIN_NOISE.baseElevationM + TERRAIN_NOISE.amplitudeM + 0.01);
    expect(max - min).toBeGreaterThan(1);
  });

  it('is deterministic for the same world position', () => {
    expect(sampleTerrainHeightWorld(12.5, -33.2)).toBe(sampleTerrainHeightWorld(12.5, -33.2));
  });

  it('is finite far from the origin (Float64 absolute coordinates)', () => {
    expect(Number.isFinite(sampleTerrainHeightWorld(2_000_000.25, -1_350_000.75))).toBe(true);
  });
});
