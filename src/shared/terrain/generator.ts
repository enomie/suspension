import type { Layer, SampleContext, TerrainConfig } from './types';
import { createLayer } from './layers';

/**
 * Grenzen: oben weich (unverändert bis `knee` unter max, danach asymptotisch – Gipfel werden rund statt abgeschnitten),
 * unten hart (Meeresboden ist dort ohnehin flach).
 */
export function softLimit(h: number, min: number, max: number, knee: number): number {
  const hi = max - knee;
  if (h > hi) return max - (knee * knee) / (h - hi + knee);
  return h < min ? min : h;
}

export interface Terrain {
  readonly config: TerrainConfig;
  /** Höhe [m] an absoluter Position (volle Auflösung) */
  height(x: number, z: number): number;
  /**
   * (n+1)² Höhen ab absolutem (x0, z0) mit Abstand d, Zeile = Z, Spalte = X (Index j·W+i), mit `border` Rand.
   * Wellenlängen < 2·d werden weggelassen (bandbegrenzt), außer `full` = true (Physik).
   */
  sampleGrid(x0: number, z0: number, d: number, n: number, border?: number, full?: boolean): Float64Array;
  /**
   * Nächster ebener Landpunkt (Höhe minHeight … maxHeight, Gefälle < maxSlope) ab (x, z), Suche spiralförmig im
   * Raster `step`. Deterministisch. Ergebnis liegt auf dem Raster.
   */
  findLand(x: number, z: number, opts?: { minHeight?: number; maxHeight?: number; maxSlope?: number; step?: number }): { x: number; z: number };
}

/**
 * Unendliches, deterministisches Terrain aus einer Schicht-Kette. Keine Karte, kein Zustand:
 * gleiche Konfiguration → überall und in jedem Thread exakt gleiche Höhen.
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
      // Ringe wachsender Größe (Chebyshev-Abstand r), bis 2000 Ringe (~500 km bei 256 m)
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
