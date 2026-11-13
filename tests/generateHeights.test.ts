import { describe, expect, it } from 'vitest';
import {
  generateHeightfieldHeights,
  generatePlaneVertexHeights,
  getHeightStats,
  sampleTerrainHeightWorld,
} from '../src/terrain/generateHeights';
import {
  TERRAIN_COLS,
  TERRAIN_NOISE,
  TERRAIN_ROWS,
  TERRAIN_SIZE_M,
} from '../src/terrain/terrainConfig';

describe('terrain heights', () => {
  it('covers 100×100 m with expected sample count', () => {
    const hf = generateHeightfieldHeights();
    const plane = generatePlaneVertexHeights();
    const n = (TERRAIN_ROWS + 1) * (TERRAIN_COLS + 1);
    expect(hf.length).toBe(n);
    expect(plane.length).toBe(n);
  });

  it('keeps elevation detailed but not too high', () => {
    const stats = getHeightStats(generateHeightfieldHeights());
    expect(stats.min).toBeGreaterThanOrEqual(0);
    expect(stats.max).toBeLessThanOrEqual(
      TERRAIN_NOISE.baseElevationM + TERRAIN_NOISE.amplitudeM + 0.01,
    );
    expect(stats.max - stats.min).toBeGreaterThan(1);
    expect(stats.max - stats.min).toBeLessThanOrEqual(TERRAIN_NOISE.amplitudeM + 0.5);
  });

  it('is deterministic for the same world position', () => {
    const a = sampleTerrainHeightWorld(12.5, -33.2);
    const b = sampleTerrainHeightWorld(12.5, -33.2);
    expect(a).toBe(b);
  });

  it('mesh and rapier samples agree on grid corners', () => {
    const hf = generateHeightfieldHeights();
    const plane = generatePlaneVertexHeights();
    const rows = TERRAIN_ROWS;
    const half = TERRAIN_SIZE_M / 2;
    const corners = [
      { row: 0, col: 0, x: -half, z: -half },
      { row: rows, col: 0, x: half, z: -half },
      { row: 0, col: rows, x: -half, z: half },
      { row: rows, col: rows, x: half, z: half },
    ];
    for (const c of corners) {
      const fromFn = sampleTerrainHeightWorld(c.x, c.z);
      // Rapier: Spalte = X-Index, Zeile = Z-Index
      const fromHf = hf[c.row * (rows + 1) + c.col];
      const fromPlane = plane[c.col * (rows + 1) + c.row];
      expect(fromHf).toBeCloseTo(fromFn, 5);
      expect(fromPlane).toBeCloseTo(fromFn, 5);
    }
  });
});
