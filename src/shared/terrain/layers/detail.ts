import { fbm, hashString } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * Detail: ground bumps for the suspension (damped by the `road` / `spawn` masks).
 * Höhe = base + amplitude · (0,5 + 0,5 · fbm) → base … base + amplitude.
 */
export interface DetailLayerConfig {
  type: 'detail';
  name?: string;
  /** Grundhöhe [m] */
  base: number;
  /** Spanne [m] */
  amplitude: number;
  /** Wellenlänge der gröbsten Oktave [m] */
  wavelength: number;
  octaves: number;
  gain?: number;
  /** Bump span [m] where the `road` / `spawn` masks are 1 (default: no damping) */
  calmAmplitude?: number;
}

export function detailLayer(cfg: DetailLayerConfig, seed: number): Layer {
  const name = cfg.name ?? 'detail';
  const s = hashString(name, seed) | 0;
  const p = { wavelength: cfg.wavelength, octaves: cfg.octaves, gain: cfg.gain ?? 0.45 };
  return {
    name,
    apply(ctx: SampleContext) {
      const n = fbm(ctx.x, ctx.z, s, p, ctx.minWavelength);
      const road = ctx.masks.road ?? 0;
      const spawn = ctx.masks.spawn ?? 0;
      const calm = cfg.calmAmplitude === undefined ? 0 : road > spawn ? road : spawn;
      if (calm <= 0) {
        ctx.height += cfg.base + cfg.amplitude * (0.5 + 0.5 * n);
      } else {
        const amp = cfg.amplitude + (cfg.calmAmplitude! - cfg.amplitude) * calm;
        ctx.height += cfg.base + 0.5 * cfg.amplitude + 0.5 * amp * n;
      }
    },
  };
}
