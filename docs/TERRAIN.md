# Terrain – unendlich, LOD, Floating Origin

## Raster (alles Zweierpotenzen)
| Stufe k | Zellweite | Kachelkante | Rolle |
|---|---|---|---|
| 0 | 0,5 m | 32 m | Optik nah = **Physik-Raster** (Physik-Kachel 64 m = 2×2 Render-Kacheln) |
| 1–5 | 1–16 m | 64–1024 m | fein geteilt (`lodSplit` 0,9) → Detail bis ~2 km |
| 6–10 | 32–512 m | 2048–32 768 m | grob geteilt (0,5) → Fernbereich bis 32 768 m (Nebel-Ende) |

Stufe k tastet exakt jeden zweiten Punkt von Stufe k−1 ab (gleicher Abtaster `sampleGrid`, gleiche Diagonale) →
grobe Stufe = feine Stufe ohne die ungeraden Punkte. Origin-Shift im 64-m-Raster ab 1024 m.

| Datei | Zuständig |
|---|---|
| `src/shared/config.ts` | `CELL`, `TILE_SIZE`, `MAX_LOD`, `VIEW_DISTANCE`, `DETAIL_RANGE`, `lodSplit()`, Physik-Kacheln |
| `src/shared/terrainHeight.ts` | `sampleTerrainHeightWorld(x, z)` (fbm, absolute Koordinaten) + `sampleGrid()` – **einziger** Abtaster für Physik und Optik |
| `src/shared/tileGeometry.ts` | Kachel: Positionen, Normalen, Skirts, Indexpuffer + Morph-Daten (grobe Höhe **und** grobe Normale, Morph-Bereich) |
| `src/render/terrain/LodTerrain.ts` | Quadtree-Auswahl (Hysterese bei Teilung **und** Sichtweite), Worker-Pool, **ein BatchedMesh** (320 feste Plätze, LRU) |
| `src/render/terrain/tileWorker.ts` | Kachel-Worker (Transfer ohne Kopie) |
| `src/physics/terrainColliders.ts` | 3×3 Rapier-Heightfields à 64 m (128 Zellen) um das Fahrzeug |

## Gegen Flackern / Popping
- **Verfeinern Ebene für Ebene:** eine Kachel wird nur durch ihre 4 Kinder ersetzt, wenn diese fertig sind; fehlt eins,
  bleibt nur diese Kachel stehen. (Früher musste der ganze Teilbaum bis LOD 0 fertig sein – beim Fahren fiel dann
  regelmäßig ein großer Bereich bis auf die 32-km-Wurzel zurück → starkes Flackern. Test: „LOD beim Fahren“.)
- Gerade gebrauchte Kacheln (sichtbar + Kinder in Vorbereitung) werden nicht aus dem Cache verdrängt.
- **CDLOD-Geomorphing** im Vertex-Shader: zwischen `morphRange` (0,65·end … end, end = Teilungsabstand des Elternteils)
  gleiten Höhe und Normale zur gröberen Stufe. Beim Teilen sehen die Kinder exakt wie der Elternteil aus, beim
  Zusammenfassen ebenso → weder Geometrie- noch Licht-Sprung.
- Wurzeln werden nach Sichtweite gewählt (kein festes 3×3-Fenster, das an Wurzelgrenzen springt).
- Sichtbarkeit nur bei Änderung umschalten; Auswahl nur bei Kamerabewegung > 0,25 m oder neuen Kacheln.

## Zahlen
~140–150 Kacheln sichtbar (bis 32 km), **1 Draw Call**, ~1,2 Mio. Dreiecke. Terrain wirft keine Schatten.

## Später
- Fern-Physik: gröbere Heightfield-Ringe (Zellweite 2^k · 0,5 m) über `sampleGrid`, eigene Collision-Group
  (nur ferne Objekte), damit das Fahrzeug nicht doppelt kollidiert.
- Großräumige Variation (Berge/Ebenen) über zusätzliche niederfrequente Noise-Ebene.
