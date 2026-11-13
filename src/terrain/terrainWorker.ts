/// <reference lib="webworker" />
import { buildTileArrays } from './tileGeometry';

/** Worker: Kachel berechnen, Puffer ohne Kopie (transfer) zurückgeben. */
export interface TileRequest {
  key: string;
  lod: number;
  ix: number;
  iz: number;
}

self.onmessage = (e: MessageEvent<TileRequest>) => {
  const { key, lod, ix, iz } = e.data;
  const { position, normal } = buildTileArrays(lod, ix, iz);
  (self as unknown as Worker).postMessage({ key, lod, ix, iz, position, normal }, [position.buffer, normal.buffer]);
};
