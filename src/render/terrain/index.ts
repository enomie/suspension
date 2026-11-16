/**
 * LOD terrain (rendering) — public entry. Needs three.js (WebGPU/TSL) and active terrain
 * from src/shared/terrain. Docs: src/docs/INTEGRATION_TERRAIN.md, src/docs/TERRAIN.md
 *   const lod = new LodTerrain(); scene.add(lod.root);
 *   // per frame (after camera update): lod.update(camera.position.x, camera.position.y, camera.position.z)
 */
export { LodTerrain, morphEnabled } from './LodTerrain';
