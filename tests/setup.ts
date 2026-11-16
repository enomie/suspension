import { HILLS_TERRAIN, setTerrain } from '../src/shared/terrain';

/**
 * Suspension, physics, and LOD tests run on the flat hill world (reproducible, independent of mountains/sea).
 * Generator tests build their own worlds via createTerrain().
 */
setTerrain(HILLS_TERRAIN);
