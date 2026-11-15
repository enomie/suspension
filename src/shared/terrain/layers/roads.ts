import { hash2, hashString, smoothstep } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * Roads: edges of a Voronoi diagram (jittered feature points, one per cell).
 * Distance to the nearest edge is exact (distance to the bisector of the two nearest points).
 * Writes mask `road` (1 on the road, 0 beyond `width/2 + blend`); the detail layer damps its bumps with it.
 */
export interface RoadsLayerConfig {
  type: 'roads';
  name?: string;
  /** Average distance between roads [m] */
  cellSize: number;
  /** Road width [m] */
  width: number;
  /** Soft shoulder next to the road [m] */
  blend: number;
}

export function roadsLayer(cfg: RoadsLayerConfig, seed: number): Layer {
  const name = cfg.name ?? 'roads';
  const s = hashString(name, seed) | 0;
  const inv = 1 / cfg.cellSize;
  const half = cfg.width / 2;
  const U = 1 / 4294967296;
  return {
    name,
    apply(ctx: SampleContext) {
      const gx = ctx.x * inv;
      const gz = ctx.z * inv;
      const ix = Math.floor(gx);
      const iz = Math.floor(gz);
      // feature points of the 3×3 neighbourhood (jitter 0.1 … 0.9 keeps the nearest two inside it)
      let d1 = Infinity;
      let p1x = 0;
      let p1z = 0;
      const px = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      const pz = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      let k = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++, k++) {
          const cx = ix + i;
          const cz = iz + j;
          const x = (cx + 0.1 + 0.8 * hash2(cx, cz, s) * U) * cfg.cellSize;
          const z = (cz + 0.1 + 0.8 * hash2(cx, cz, s ^ 0x5bd1e995) * U) * cfg.cellSize;
          px[k] = x;
          pz[k] = z;
          const d = (x - ctx.x) * (x - ctx.x) + (z - ctx.z) * (z - ctx.z);
          if (d < d1) {
            d1 = d;
            p1x = x;
            p1z = z;
          }
        }
      // distance to the nearest bisector
      let edge = Infinity;
      for (let n = 0; n < 9; n++) {
        const dx = px[n] - p1x;
        const dz = pz[n] - p1z;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-9) continue; // the point itself
        const d2 = (px[n] - ctx.x) * (px[n] - ctx.x) + (pz[n] - ctx.z) * (pz[n] - ctx.z);
        const e = (d2 - d1) / (2 * Math.sqrt(len2));
        if (e < edge) edge = e;
      }
      ctx.masks.road = 1 - smoothstep(half, half + cfg.blend, edge);
    },
  };
}
