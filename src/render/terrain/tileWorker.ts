/// <reference lib="webworker" />
import { buildTileArrays } from '../../shared/tileGeometry';
import { setTerrain, type TerrainConfig } from '../../shared/terrain';

/** tile job */
export interface TileRequest {
  type: 'tile';
  key: string;
  lod: number;
  ix: number;
  iz: number;
}
/** main thread → tile worker: first `terrain` (config), then any number of `tile` */
export type TileWorkerMessage = { type: 'terrain'; config: TerrainConfig } | TileRequest;

/** tile worker: compute tile, return buffers via transfer (no copy). */
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
    a.road.buffer,
    a.bounds.buffer,
  ]);
};
