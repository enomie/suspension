import { smoothstep } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * Calm zone (spawn area): writes mask `spawn` (1 inside `radius`, fading to 0 at `radius + falloff`).
 * Mountains stay out of it and the detail layer damps its bumps there.
 */
export interface CalmLayerConfig {
  type: 'calm';
  name?: string;
  x: number;
  z: number;
  radius: number;
  falloff: number;
}

export function calmLayer(cfg: CalmLayerConfig): Layer {
  return {
    name: cfg.name ?? 'calm',
    provides: ['spawn'],
    apply(ctx: SampleContext) {
      const dx = ctx.x - cfg.x;
      const dz = ctx.z - cfg.z;
      ctx.masks.spawn = 1 - smoothstep(cfg.radius, cfg.radius + cfg.falloff, Math.sqrt(dx * dx + dz * dz));
    },
  };
}
