import type { Layer, LayerConfig } from '../types';
import { continentLayer } from './continent';
import { detailLayer } from './detail';
import { mountainLayer } from './mountains';

/** Schicht-Typ → Fabrik. Neue Schicht: Datei in layers/, hier eintragen, Typ in types.ts ergänzen. */
export function createLayer(cfg: LayerConfig, seed: number): Layer {
  switch (cfg.type) {
    case 'continent':
      return continentLayer(cfg, seed);
    case 'mountains':
      return mountainLayer(cfg, seed);
    case 'detail':
      return detailLayer(cfg, seed);
  }
}
