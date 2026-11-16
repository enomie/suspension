import { terrain } from './terrain';

/** terrain height [m] at ABSOLUTE position (full resolution) — active terrain of this thread. */
export const sampleTerrainHeightWorld = (x: number, z: number): number => terrain().height(x, z);

/**
 * ONE sampler for physics and rendering: (n+1)² heights from absolute (x0, z0) with spacing d (index j·W+i, row = Z),
 * optional `border` margin samples. `full` = all wavelengths (physics); else band-limited to ≥ 2·d.
 */
export const sampleGrid = (x0: number, z0: number, d: number, n: number, border = 0, full = false): Float64Array =>
  terrain().sampleGrid(x0, z0, d, n, border, full);
