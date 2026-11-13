import { fbm, hashString } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * Detail: Bodenwellen fürs Fahrwerk (heute die einzige Schicht).
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
}

export function detailLayer(cfg: DetailLayerConfig, seed: number): Layer {
  const name = cfg.name ?? 'detail';
  const s = hashString(name, seed) | 0;
  const p = { wavelength: cfg.wavelength, octaves: cfg.octaves, gain: cfg.gain ?? 0.45 };
  return {
    name,
    apply(ctx: SampleContext) {
      const n = fbm(ctx.x, ctx.z, s, p, ctx.minWavelength);
      ctx.height += cfg.base + cfg.amplitude * (0.5 + 0.5 * n);
    },
  };
}
