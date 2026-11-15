import type { Layer, LayerConfig } from '../types';
import { calmLayer } from './calm';
import { continentLayer } from './continent';
import { detailLayer } from './detail';
import { mountainLayer } from './mountains';
import { testHillsLayer } from './testHills';
import { roadsLayer } from './roads';

/** Schicht-Typ → Fabrik. Neue Schicht: Datei in layers/, hier eintragen, Typ in types.ts ergänzen. */
export function createLayer(cfg: LayerConfig, seed: number): Layer {
  switch (cfg.type) {
    case 'continent':
      return continentLayer(cfg, seed);
    case 'mountains':
      return mountainLayer(cfg, seed);
    case 'testHills':
      return testHillsLayer(cfg);
    case 'calm':
      return calmLayer(cfg);
    case 'roads':
      return roadsLayer(cfg, seed);
    case 'detail':
      return detailLayer(cfg, seed);
  }
}
