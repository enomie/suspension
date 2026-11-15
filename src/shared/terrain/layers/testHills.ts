import type { Layer, SampleContext } from '../types';

/**
 * Test hills: round domes with a constant slope on the flank and a smoothly rounded crest and foot.
 * For off-road tests; placed explicitly (plain data, no trigonometry → bit-identical everywhere).
 * Profile: linear cone u = slope · (reach − r) (apex height at r = 0), rounded with a C1 quadratic blend
 * of half-width `round` [m of height] at the foot (u = 0) and at the crest (u = height).
 */
export interface TestHillsLayerConfig {
  type: 'testHills';
  name?: string;
  /** Height of the cone apex above the ground [m] (the rounded crest ends up ~round/4 lower) */
  height: number;
  /** Rounding of foot and crest, as height range [m] */
  round: number;
  /** Hills: centre [m] and flank slope (rise/run: 0.5 ≈ 27°, 1 = 45°) */
  hills: { x: number; z: number; slope: number }[];
}

/** max(u, 0), rounded: 0 below −k, u above k, quadratic in between (C1) */
function softPos(u: number, k: number): number {
  if (u <= -k) return 0;
  if (u >= k) return u;
  const t = u + k;
  return (t * t) / (4 * k);
}

export function testHillsLayer(cfg: TestHillsLayerConfig): Layer {
  const k = cfg.round;
  return {
    name: cfg.name ?? 'testHills',
    apply(ctx: SampleContext) {
      let add = 0;
      for (const h of cfg.hills) {
        const reach = cfg.height / h.slope; // radius where the cone reaches the ground
        const outer = reach + k / h.slope; // radius where the rounded foot ends
        const dx = ctx.x - h.x;
        const dz = ctx.z - h.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= outer * outer) continue;
        const u = h.slope * (reach - Math.sqrt(d2));
        // foot rounding, then crest rounding (min(u, height) as height − softPos(height − u))
        const v = cfg.height - softPos(cfg.height - softPos(u, k), k);
        if (v > add) add = v;
      }
      ctx.height += add;
    },
  };
}
