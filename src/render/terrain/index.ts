/**
 * LOD-Terrain (Optik) – öffentlicher Einstieg. Braucht three.js (WebGPU/TSL) und das aktive Terrain
 * aus src/shared/terrain. Doku: src/docs/INTEGRATION_TERRAIN.md, src/docs/TERRAIN.md
 *   const lod = new LodTerrain(); scene.add(lod.root);
 *   // pro Frame (nach Kamera-Update): lod.update(camera.position.x, camera.position.y, camera.position.z)
 */
export { LodTerrain, morphEnabled } from './LodTerrain';
