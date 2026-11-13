import { HILLS_TERRAIN, setTerrain } from '../src/shared/terrain';

/**
 * Fahrwerks-, Physik- und LOD-Tests laufen auf der flachen Hügelwelt (reproduzierbar, unabhängig von Gebirge/Meer).
 * Generator-Tests erzeugen ihre Welten selbst mit createTerrain().
 */
setTerrain(HILLS_TERRAIN);
