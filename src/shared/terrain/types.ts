/**
 * Terrain-Generator: Typen. Alles hier ist reine Daten bzw. reine Funktionen (kein three.js, kein Rapier),
 * damit dieselbe Konfiguration in jedem Thread und in anderen Projekten denselben Boden ergibt.
 */
import type { DetailLayerConfig } from './layers/detail';

/** Konfiguration einer Schicht – reine Daten (per postMessage übertragbar) */
export type LayerConfig = DetailLayerConfig;

export interface TerrainConfig {
  /** Grund-Seed; jede Schicht leitet daraus ihren eigenen ab (Name + Seed) */
  seed: number;
  /** Schichten in Reihenfolge der Auswertung */
  layers: LayerConfig[];
}

/**
 * Zustand eines Abtastpunkts, den die Schichten nacheinander bearbeiten.
 * Spätere Schichten lesen Masken früherer (z. B. `land`, `mountain`).
 */
export interface SampleContext {
  /** absolute Position [m] */
  x: number;
  z: number;
  /** Höhe [m] über Sea Level (y = 0) */
  height: number;
  /** Masken 0…1 von früheren Schichten */
  masks: Record<string, number>;
  /** Wellenlängen darunter weglassen (grobe LOD-Stufen); 0 = volle Auflösung (Physik) */
  minWavelength: number;
}

/** Eine Schicht: verändert ctx.height (und ggf. Masken). Muss deterministisch sein. */
export interface Layer {
  readonly name: string;
  apply(ctx: SampleContext): void;
}
