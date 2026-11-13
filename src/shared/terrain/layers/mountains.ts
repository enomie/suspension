import { fbm, hashString, simplex2, smoothstep } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * Gebirge: einzelne Gebirgszüge (nicht flächendeckend).
 *   Maske   = großräumiges Rauschen über Schwelle × `inland` (nur auf Land, nicht an der Küste)
 *   Form    = „ridged multifractal“ (scharfe Grate, Täler dazwischen), per Domain Warp verbogen,
 *             entlang einer Richtung gestreckt → längliche Züge statt runder Flecken
 *   Höhe    = maxHeight · Maske · Grat
 * Maske `mountain` für spätere Schichten (Hügel/Detail/Material).
 * Rechenzeit: Grat-Oktaven nur, wo die Maske > 0 ist (meistens nicht).
 */
export interface MountainLayerConfig {
  type: 'mountains';
  name?: string;
  /** Höhe der höchsten Gipfel über dem Land [m] */
  maxHeight: number;
  /** Wellenlänge der Gebirgs-Maske [m] (≈ Abstand der Gebirgszüge) */
  rangeWavelength: number;
  /** Anteil der Fläche mit Gebirge: Masken-Schwelle (höher = seltener) */
  rangeThreshold: number;
  /** Wellenlänge der Grate [m] */
  ridgeWavelength: number;
  ridgeOctaves: number;
  /** Streckung entlang der Kammrichtung (1 = rund, 3 = langgezogen) */
  stretch: number;
  /** Domain-Warp-Stärke [m] */
  warp: number;
}

// Kammrichtung (fest, ≈ 30°) – Domain Warp sorgt für Biegung
const DC = 0.8660254037844387;
const DS = 0.5;

export function mountainLayer(cfg: MountainLayerConfig, seed: number): Layer {
  const name = cfg.name ?? 'mountains';
  const s = hashString(name, seed) | 0;
  const sMask = hashString(name + ':mask', seed) | 0;
  const sWx = hashString(name + ':wx', seed) | 0;
  const sWz = hashString(name + ':wz', seed) | 0;
  const mask = { wavelength: cfg.rangeWavelength, octaves: 3, gain: 0.5 };
  const warp = { wavelength: cfg.ridgeWavelength * 4, octaves: 3, gain: 0.5 };
  return {
    name,
    apply(ctx: SampleContext) {
      ctx.masks.mountain = 0;
      const inland = ctx.masks.inland ?? 1;
      if (inland <= 0) return;
      const m = smoothstep(cfg.rangeThreshold, cfg.rangeThreshold + 0.25, fbm(ctx.x, ctx.z, sMask, mask)) * inland;
      if (m <= 0) return;
      ctx.masks.mountain = m;

      // Domain Warp + Streckung entlang der Kammrichtung
      const wx = ctx.x + cfg.warp * fbm(ctx.x, ctx.z, sWx, warp, ctx.minWavelength);
      const wz = ctx.z + cfg.warp * fbm(ctx.x, ctx.z, sWz, warp, ctx.minWavelength);
      const u = (DC * wx + DS * wz) / cfg.stretch; // entlang des Kamms gestreckt
      const w = -DS * wx + DC * wz;

      // ridged multifractal: 1 − |noise|, quadriert; jede Oktave gewichtet mit der vorigen (Grate bleiben scharf)
      let f = 1 / cfg.ridgeWavelength;
      let wl = cfg.ridgeWavelength;
      let amp = 1;
      let weight = 1;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < cfg.ridgeOctaves; o++) {
        norm += amp;
        if (wl >= ctx.minWavelength) {
          const n = simplex2(u * f, w * f, (s + Math.imul(o, 0x9e3779b1)) | 0);
          let r = 1 - (n < 0 ? -n : n);
          r *= r * weight;
          weight = r * 2 > 1 ? 1 : r * 2;
          sum += r * amp;
        }
        amp *= 0.5;
        f *= 2;
        wl /= 2;
      }
      const ridge = sum / norm; // 0 … ~1
      ctx.height += cfg.maxHeight * m * ridge;
    },
  };
}
