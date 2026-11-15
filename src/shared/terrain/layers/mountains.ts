import { fbm, hashString, simplex2, smoothstep } from '../noise';
import type { Layer, SampleContext } from '../types';

/**
 * Gebirge: einzelne Gebirgszüge (nicht flächendeckend), aus drei Teilen:
 *   1. Masse     – glattes Rauschen (massWavelength): Gebirgsstock, hebt das Gelände an
 *   2. Grate     – wenige große „ridged“-Oktaven mit abgerundetem Kamm (|n| weich: √(n² + k²)),
 *                  jede Oktave gewichtet mit der vorigen → Hauptgrate mit Seitengraten
 *   3. Feinform  – normales Rauschen, an steilen Stellen gedämpft (Hänge glatt wie erodiert, Kämme bleiben)
 *   Maske = großräumiges Rauschen über Schwelle × `inland`, quadratisch auslaufend → sanfte Vorberge.
 * Masken: `mountain` (0…1) für spätere Schichten. Rechenzeit nur, wo die Maske > 0 ist.
 */
export interface MountainLayerConfig {
  type: 'mountains';
  name?: string;
  /** Höhe der höchsten Gipfel über dem Land [m] */
  maxHeight: number;
  /** Wellenlänge der Gebirgs-Maske [m] (≈ Abstand der Gebirgszüge) */
  rangeWavelength: number;
  /** Masken-Schwelle (höher = seltener) */
  rangeThreshold: number;
  /** Breite des Übergangs Ebene → Gebirge (in Masken-Einheiten) */
  rangeFalloff: number;
  /** Wellenlänge der Gebirgsmasse [m] */
  massWavelength: number;
  /** Wellenlänge des größten Grats [m] */
  ridgeWavelength: number;
  /** Anzahl Grat-Oktaven (2–3) */
  ridgeOctaves: number;
  /** Feinform-Oktaven nach den Graten */
  detailOctaves: number;
  /** Stärke der Feinform an den Kämmen (Anteil von maxHeight, z. B. 0,02) */
  fineAmount: number;
  /** Rundung der Kämme (0 = messerscharf, 0,1–0,3 = gerundet) */
  crestRound: number;
  /** Streckung entlang der Kammrichtung (1 = keine) */
  stretch: number;
  /** Domain-Warp-Stärke [m] */
  warp: number;
}

// Kammrichtung (≈ 30°)
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
      const m = raw * raw * inland * (1 - (ctx.masks.spawn ?? 0)); // quadratisch → lange, sanfte Vorberge
      if (m <= 0) return;
      ctx.masks.mountain = m;
      const minWl = ctx.minWavelength;

      // 1. Masse: 0 … 1
      const mass = 0.5 + 0.5 * fbm(ctx.x, ctx.z, sMass, massP, minWl);

      // Koordinaten für Grate: leichter Warp + leichte Streckung entlang der Kammrichtung
      const wx = ctx.x + cfg.warp * fbm(ctx.x, ctx.z, sWx, warpP, minWl);
      const wz = ctx.z + cfg.warp * fbm(ctx.x, ctx.z, sWz, warpP, minWl);
      const u = (DC * wx + DS * wz) / cfg.stretch;
      const w = -DS * wx + DC * wz;

      // 2. Grate: weicher Betrag → runde Kämme; Gewichtung mit voriger Oktave → Seitengrate an Hauptgraten
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
          let r = 1 - Math.sqrt(n * n + k2) + cfg.crestRound; // 1 am Kamm, gerundet
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

      // 3. Feinform: nur an Kämmen (felsig), Flanken und Täler bleiben glatt (wie erodiert)
      const fineP = { wavelength: wl, octaves: cfg.detailOctaves, gain: 0.45, lacunarity: 2.1 };
      const fine = ridge > 0.05 ? fbm(u, w, sFine, fineP, minWl) * ridge * ridge : 0;

      const shape = 0.3 * mass + 0.7 * ridge + cfg.fineAmount * fine;
      ctx.height += cfg.maxHeight * m * (shape < 0 ? 0 : shape);
    },
  };
}
