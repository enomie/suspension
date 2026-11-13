import { terrain } from './terrain';

/** Geländehöhe [m] an ABSOLUTER Position (volle Auflösung) – aktives Terrain dieses Threads. */
export const sampleTerrainHeightWorld = (x: number, z: number): number => terrain().height(x, z);

/**
 * EIN Abtaster für Physik und Optik: (n+1)² Höhen ab absolutem (x0, z0) mit Abstand d (Index j·W+i, Zeile = Z),
 * optional mit `border` Punkten Rand. `full` = alle Wellenlängen (Physik); sonst bandbegrenzt auf ≥ 2·d.
 */
export const sampleGrid = (x0: number, z0: number, d: number, n: number, border = 0, full = false): Float64Array =>
  terrain().sampleGrid(x0, z0, d, n, border, full);
