import type { Layer, SampleContext } from '../types';

/**
 * Test hills: round mounds with a constant slope on the flank (truncated cones, plateau on top).
 * For off-road tests; placed explicitly (plain data, no trigonometry → bit-identical everywhere).
 * Height above the ground: min(height, slope · (distance to the flank's foot)).
 */
export interface TestHillsLayerConfig {
  type: 'testHills';
  name?: string;
  /** Plateau height above the ground [m] */
  height: number;
  /** Plateau radius [m] */
  topRadius: number;
  /** Hills: centre [m] and flank slope (rise/run: 0.5 ≈ 27°, 1 = 45°) */
  hills: { x: number; z: number; slope: number }[];
}

export function testHillsLayer(cfg: TestHillsLayerConfig): Layer {
  return {
    name: cfg.name ?? 'testHills',
    apply(ctx: SampleContext) {
      let add = 0;
      for (const h of cfg.hills) {
        const run = cfg.height / h.slope; // horizontal length of the flank
        const dx = ctx.x - h.x;
        const dz = ctx.z - h.z;
        const reach = cfg.topRadius + run;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        const r = Math.sqrt(d2);
        const v = r <= cfg.topRadius ? cfg.height : h.slope * (reach - r);
        if (v > add) add = v;
      }
      ctx.height += add;
    },
  };
}
