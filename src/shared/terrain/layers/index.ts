import type { Layer, LayerConfig } from '../types';
import { detailLayer } from './detail';

/** Schicht-Typ → Fabrik. Neue Schicht: Datei in layers/, hier eintragen, Typ in types.ts ergänzen. */
export function createLayer(cfg: LayerConfig, seed: number): Layer {
  switch (cfg.type) {
    case 'detail':
      return detailLayer(cfg, seed);
  }
}
