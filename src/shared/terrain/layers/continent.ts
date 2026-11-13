import { fbm, hashString, smoothstep } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * Kontinent: sehr großräumiges Rauschen entscheidet Land / Meer.
 *   v = fbm − seaThreshold   (seaThreshold so gewählt, dass ~landFraction Land ist)
 *   Land:  0 … landHeight (flache Küste, Tiefebenen, sanft ansteigend ins Landesinnere)
 *   Meer:  Schelf bis shelfDepth, dann Abhang bis maxDepth
 * Masken: `land` (0/1 weich), `coast` (1 an der Küste), `inland` (1 weit im Landesinneren)
 */
export interface ContinentLayerConfig {
  type: 'continent';
  name?: string;
  /** Wellenlänge der gröbsten Oktave [m] */
  wavelength: number;
  octaves: number;
  /** fbm-Schwelle Land/Meer (−0,06 ≈ 60 % Land bei 6 Oktaven, gain 0,5) */
  seaThreshold: number;
  /** höchste Landhöhe ohne Gebirge [m] */
  landHeight: number;
  /** Tiefe am Schelfrand [m, negativ] */
  shelfDepth: number;
  /** tiefstes Meer [m, negativ] */
  maxDepth: number;
}

export function continentLayer(cfg: ContinentLayerConfig, seed: number): Layer {
  const name = cfg.name ?? 'continent';
  const s = hashString(name, seed) | 0;
  const p = { wavelength: cfg.wavelength, octaves: cfg.octaves, gain: 0.5 };
  return {
    name,
    apply(ctx: SampleContext) {
      const v = fbm(ctx.x, ctx.z, s, p, ctx.minWavelength) - cfg.seaThreshold;
      if (v >= 0) {
        ctx.height += cfg.landHeight * smoothstep(0, 0.35, v);
      } else {
        const d = -v;
        ctx.height += cfg.shelfDepth * smoothstep(0, 0.03, d) + (cfg.maxDepth - cfg.shelfDepth) * smoothstep(0.03, 0.3, d);
      }
      ctx.masks.land = smoothstep(-0.005, 0.02, v);
      ctx.masks.coast = 1 - smoothstep(0, 0.04, v < 0 ? -v : v);
      ctx.masks.inland = smoothstep(0.04, 0.2, v);
    },
  };
}
