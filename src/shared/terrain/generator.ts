import type { Layer, SampleContext, TerrainConfig } from './types';
import { createLayer } from './layers';

/**
 * bounds: soft top (unchanged until `knee` below max, then asymptotic — peaks round instead of clipped),
 * hard bottom (sea floor is flat there anyway).
 */
export function softLimit(h: number, min: number, max: number, knee: number): number {
  const hi = max - knee;
  if (h > hi) return max - (knee * knee) / (h - hi + knee);
  return h < min ? min : h;
}

export interface Terrain {
  readonly config: TerrainConfig;
  /** height [m] at absolute position (full resolution) */
  height(x: number, z: number): number;
  /**
   * (n+1)² heights from absolute (x0, z0) with spacing d, row = Z, column = X (index j·W+i), with `border` margin.
   * wavelengths < 2·d omitted (band-limited), unless `full` = true (physics).
   */
  sampleGrid(x0: number, z0: number, d: number, n: number, border?: number, full?: boolean): Float64Array;
  /**
   * nearest flat land point (height minHeight … maxHeight, slope < maxSlope) from (x, z), spiral search on
   * grid `step`. deterministic. result lies on grid.
   */
  /**
   * (n+1)² values of mask `name` (0…1) from absolute (x0, z0) with spacing d (index j·W+i); band-limited to ≥ 2·d.
   * Only runs the layers up to the last one that provides the mask.
   */
  sampleMask(name: string, x0: number, z0: number, d: number, n: number): Float32Array;
  findLand(x: number, z: number, opts?: { minHeight?: number; maxHeight?: number; maxSlope?: number; step?: number }): { x: number; z: number };
}

/**
 * infinite deterministic terrain from a layer chain. no map, no state:
 * same config → identical heights everywhere and in every thread.
 */
export function createTerrain(config: TerrainConfig): Terrain {
  const layers: Layer[] = config.layers.map((l) => createLayer(l, config.seed));
  const lim = config.limits;
  const ctx: SampleContext = { x: 0, z: 0, height: 0, masks: {}, minWavelength: 0 };
  const run = (x: number, z: number, minWl: number): number => {
    ctx.x = x;
    ctx.z = z;
    ctx.height = 0;
    ctx.minWavelength = minWl;
    for (const k in ctx.masks) ctx.masks[k] = 0;
    for (const l of layers) l.apply(ctx);
    return lim ? softLimit(ctx.height, lim.min, lim.max, lim.knee) : ctx.height;
  };
  return {
    config,
    height: (x, z) => run(x, z, 0),
    sampleGrid(x0, z0, d, n, border = 0, full = false) {
      const W = n + 1 + 2 * border;
      const h = new Float64Array(W * W);
      const minWl = full ? 0 : 2 * d;
      for (let j = 0; j < W; j++)
        for (let i = 0; i < W; i++) h[j * W + i] = run(x0 + (i - border) * d, z0 + (j - border) * d, minWl);
      return h;
    },
    sampleMask(name, x0, z0, d, n) {
      let last = -1;
      layers.forEach((l, i) => {
        if (l.provides?.includes(name)) last = i;
      });
      const W = n + 1;
      const out = new Float32Array(W * W);
      if (last < 0) return out;
      for (let j = 0; j < W; j++)
        for (let i = 0; i < W; i++) {
          ctx.x = x0 + i * d;
          ctx.z = z0 + j * d;
          ctx.height = 0;
          ctx.minWavelength = 2 * d;
          for (const k in ctx.masks) ctx.masks[k] = 0;
          for (let l = 0; l <= last; l++) layers[l].apply(ctx);
          out[j * W + i] = ctx.masks[name] ?? 0;
        }
      return out;
    },
    findLand(x, z, opts = {}) {
      const { minHeight = 5, maxHeight = 400, maxSlope = 0.15, step = 256 } = opts;
      const ox = Math.round(x / step) * step;
      const oz = Math.round(z / step) * step;
      const ok = (px: number, pz: number) => {
        const h = run(px, pz, 0);
        if (h < minHeight || h > maxHeight) return false;
        const sx = (run(px + 8, pz, 0) - run(px - 8, pz, 0)) / 16;
        const sz = (run(px, pz + 8, 0) - run(px, pz - 8, 0)) / 16;
        return Math.sqrt(sx * sx + sz * sz) < maxSlope;
      };
      // rings of growing size (Chebyshev distance r), up to 2000 rings (~500 km at 256 m)
      for (let r = 0; r <= 2000; r++)
        for (let i = -r; i <= r; i++)
          for (const [dx, dz] of [[i, -r], [i, r], [-r, i], [r, i]]) {
            if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
            const px = ox + dx * step;
            const pz = oz + dz * step;
            if (ok(px, pz)) return { x: px, z: pz };
          }
      return { x: ox, z: oz };
    },
  };
}
