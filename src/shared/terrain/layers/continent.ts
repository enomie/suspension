import { fbm, hashString, smoothstep } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * continent: very large-scale noise decides land / sea.
 *   v = fbm − seaThreshold   (seaThreshold chosen so ~landFraction is land)
 *   land:  0 … landHeight (flat coast, low plains, gentle rise inland)
 *   sea:  shelf to shelfDepth, then slope to maxDepth
 * masks: `land` (soft 0/1), `coast` (1 at coast), `inland` (1 deep inland)
 */
export interface ContinentLayerConfig {
  type: 'continent';
  name?: string;
  /** wavelength of coarsest octave [m] */
  wavelength: number;
  octaves: number;
  /** fbm threshold land/sea (−0.06 ≈ 60% land at 6 octaves, gain 0.5) */
  seaThreshold: number;
  /** highest land height without mountains [m] */
  landHeight: number;
  /** depth at shelf edge [m, negative] */
  shelfDepth: number;
  /** deepest sea [m, negative] */
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
