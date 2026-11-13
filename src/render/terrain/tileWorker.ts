/// <reference lib="webworker" />
import { buildTileArrays } from '../../shared/tileGeometry';
import { setTerrain, type TerrainConfig } from '../../shared/terrain';

/** Kachel-Auftrag */
export interface TileRequest {
  type: 'tile';
  key: string;
  lod: number;
  ix: number;
  iz: number;
}
/** Haupt-Thread → Kachel-Worker: erst `terrain` (Konfiguration), dann beliebig viele `tile` */
export type TileWorkerMessage = { type: 'terrain'; config: TerrainConfig } | TileRequest;

/** Kachel-Worker: Kachel berechnen, Puffer ohne Kopie (transfer) zurückgeben. */
self.onmessage = (e: MessageEvent<TileWorkerMessage>) => {
  const m = e.data;
  if (m.type === 'terrain') return void setTerrain(m.config);
  const a = buildTileArrays(m.lod, m.ix, m.iz);
  (self as unknown as Worker).postMessage({ key: m.key, lod: m.lod, ix: m.ix, iz: m.iz, ...a }, [
    a.position.buffer,
    a.normal.buffer,
    a.morph.buffer,
    a.morphNormal.buffer,
    a.morphRange.buffer,
    a.bounds.buffer,
  ]);
};
