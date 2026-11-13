import type { Layer, SampleContext, TerrainConfig } from './types';
import { createLayer } from './layers';

export interface Terrain {
  readonly config: TerrainConfig;
  /** Höhe [m] an absoluter Position (volle Auflösung) */
  height(x: number, z: number): number;
  /**
   * (n+1)² Höhen ab absolutem (x0, z0) mit Abstand d, Zeile = Z, Spalte = X (Index j·W+i), mit `border` Rand.
   * Wellenlängen < 2·d werden weggelassen (bandbegrenzt), außer `full` = true (Physik).
   */
  sampleGrid(x0: number, z0: number, d: number, n: number, border?: number, full?: boolean): Float64Array;
}

/**
 * Unendliches, deterministisches Terrain aus einer Schicht-Kette. Keine Karte, kein Zustand:
 * gleiche Konfiguration → überall und in jedem Thread exakt gleiche Höhen.
 */
export function createTerrain(config: TerrainConfig): Terrain {
  const layers: Layer[] = config.layers.map((l) => createLayer(l, config.seed));
  const ctx: SampleContext = { x: 0, z: 0, height: 0, masks: {}, minWavelength: 0 };
  const run = (x: number, z: number, minWl: number): number => {
    ctx.x = x;
    ctx.z = z;
    ctx.height = 0;
    ctx.minWavelength = minWl;
    for (const k in ctx.masks) ctx.masks[k] = 0;
    for (const l of layers) l.apply(ctx);
    return ctx.height;
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
  };
}
