import { fbm, hashString, simplex2, smoothstep } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * mountains: individual ranges (not blanket coverage), three parts:
 *   1. mass     – smooth noise (massWavelength): mountain bulk, raises terrain
 *   2. ridges   – few large ridged octaves with rounded crest (soft |n|: √(n² + k²)),
 *                 each octave weighted by previous → main ridges with side ridges
 *   3. fine     – normal noise, damped on steep slopes (smooth eroded flanks, crests stay)
 *   mask = large-scale noise above threshold × `inland`, quadratic falloff → gentle foothills.
 * masks: `mountain` (0…1) for later layers. work only where mask > 0.
 */
export interface MountainLayerConfig {
  type: 'mountains';
  name?: string;
  /** height of highest peaks above land [m] */
  maxHeight: number;
  /** wavelength of mountain mask [m] (≈ spacing of ranges) */
  rangeWavelength: number;
  /** mask threshold (higher = rarer) */
  rangeThreshold: number;
  /** width of plain → mountain transition (mask units) */
  rangeFalloff: number;
  /** wavelength of mountain mass [m] */
  massWavelength: number;
  /** wavelength of largest ridge [m] */
  ridgeWavelength: number;
  /** number of ridge octaves (2–3) */
  ridgeOctaves: number;
  /** fine-detail octaves after ridges */
  detailOctaves: number;
  /** fine detail strength on crests (fraction of maxHeight, e.g. 0.02) */
  fineAmount: number;
  /** crest rounding (0 = sharp, 0.1–0.3 = rounded) */
  crestRound: number;
  /** stretch along ridge direction (1 = none) */
  stretch: number;
  /** domain warp strength [m] */
  warp: number;
}

// ridge direction (≈ 30°)
const DC = 0.8660254037844387;
const DS = 0.5;

export function mountainLayer(cfg: MountainLayerConfig, seed: number): Layer {
  const name = cfg.name ?? 'mountains';
  const sRidge = hashString(name, seed) | 0;
  const sMask = hashString(name + ':mask', seed) | 0;
  const sMass = hashString(name + ':mass', seed) | 0;
  const sFine = hashString(name + ':fine', seed) | 0;
  const sWx = hashString(name + ':wx', seed) | 0;
  const sWz = hashString(name + ':wz', seed) | 0;
  const maskP = { wavelength: cfg.rangeWavelength, octaves: 3, gain: 0.5 };
  const massP = { wavelength: cfg.massWavelength, octaves: 3, gain: 0.5 };
  const warpP = { wavelength: cfg.ridgeWavelength * 2, octaves: 2, gain: 0.5 };
  const k2 = cfg.crestRound * cfg.crestRound;

  return {
    name,
    apply(ctx: SampleContext) {
      ctx.masks.mountain = 0;
      const inland = ctx.masks.inland ?? 1;
      if (inland <= 0) return;
      const raw = smoothstep(cfg.rangeThreshold, cfg.rangeThreshold + cfg.rangeFalloff, fbm(ctx.x, ctx.z, sMask, maskP));
      const m = raw * raw * inland * (1 - (ctx.masks.spawn ?? 0)); // quadratic → long gentle foothills
      if (m <= 0) return;
      ctx.masks.mountain = m;
      const minWl = ctx.minWavelength;

      // 1. mass: 0 … 1
      const mass = 0.5 + 0.5 * fbm(ctx.x, ctx.z, sMass, massP, minWl);

      // ridge coordinates: light warp + stretch along ridge direction
      const wx = ctx.x + cfg.warp * fbm(ctx.x, ctx.z, sWx, warpP, minWl);
      const wz = ctx.z + cfg.warp * fbm(ctx.x, ctx.z, sWz, warpP, minWl);
      const u = (DC * wx + DS * wz) / cfg.stretch;
      const w = -DS * wx + DC * wz;

      // 2. ridges: soft magnitude → round crests; weight with prior octave → side ridges on main ridges
      let f = 1 / cfg.ridgeWavelength;
      let wl = cfg.ridgeWavelength;
      let amp = 1;
      let weight = 1;
      let ridge = 0;
      let norm = 0;
      for (let o = 0; o < cfg.ridgeOctaves; o++) {
        norm += amp;
        if (wl >= minWl) {
          const n = simplex2(u * f, w * f, (sRidge + Math.imul(o, 0x9e3779b1)) | 0);
          let r = 1 - Math.sqrt(n * n + k2) + cfg.crestRound; // 1 at crest, rounded
          r = r < 0 ? 0 : r;
          r *= r * weight;
          weight = r > 1 ? 1 : r;
          ridge += r * amp;
        }
        amp *= 0.45;
        f *= 2.1;
        wl /= 2.1;
      }
      ridge /= norm; // 0 … ~1

      // 3. fine detail: only on crests (rocky), flanks and valleys stay smooth (eroded look)
      const fineP = { wavelength: wl, octaves: cfg.detailOctaves, gain: 0.45, lacunarity: 2.1 };
      const fine = ridge > 0.05 ? fbm(u, w, sFine, fineP, minWl) * ridge * ridge : 0;

      const shape = 0.3 * mass + 0.7 * ridge + cfg.fineAmount * fine;
      ctx.height += cfg.maxHeight * m * (shape < 0 ? 0 : shape);
    },
  };
}
