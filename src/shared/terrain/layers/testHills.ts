import type { Layer, SampleContext } from '../types';

/**
 * Test hills: round domes with a constant slope on the flank, a smooth rounded crest and a smooth foot.
 * For off-road tests; placed explicitly (plain data, no trigonometry → bit-identical everywhere).
 * Profile: hyperbolic cone u = slope · (reach + c − √(r² + c²)): apex height `height` at r = 0 with zero
 * gradient there (crest radius of curvature c = crestBase + crestRel · reach), slope → `slope` on the flank.
 * Foot: u = 0 is rounded with a C1 quadratic blend of half-width `round` [m of height].
 */
export interface TestHillsLayerConfig {
  type: 'testHills';
  name?: string;
  /** Height of the crest above the ground [m] */
  height: number;
  /** Rounding of the foot, as height range [m] */
  round: number;
  /** Crest radius of curvature [m] = crestBase + crestRel · (horizontal length of the flank) */
  crestBase: number;
  crestRel: number;
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
        const reach = cfg.height / h.slope; // flank length of the plain cone
        const c = cfg.crestBase + cfg.crestRel * reach;
        const rim = reach + c + k / h.slope; // √(r² + c²) where the rounded foot ends
        const dx = ctx.x - h.x;
        const dz = ctx.z - h.z;
        const d2 = dx * dx + dz * dz;
        if (d2 + c * c >= rim * rim) continue;
        const u = h.slope * (reach + c - Math.sqrt(d2 + c * c));
        const v = softPos(u, k);
        if (v > add) add = v;
      }
      ctx.height += add;
    },
  };
}
