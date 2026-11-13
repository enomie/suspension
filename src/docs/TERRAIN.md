# Terrain – unendlich, LOD, Floating Origin

## Raster (alles Zweierpotenzen)
| Stufe k | Zellweite | Kachelkante | Rolle |
|---|---|---|---|
| 0 | 0,5 m | 32 m | Optik nah = **Physik-Raster** (Physik-Kachel 64 m = 2×2 Render-Kacheln) |
| 1–5 | 1–16 m | 64–1024 m | fein geteilt (`lodSplit` 0,9) → Detail bis ~2 km |
| 6–10 | 32–512 m | 2048–32 768 m | grob geteilt (0,5) → Fernbereich bis 32 768 m (Nebel-Ende) |

Stufe k tastet jeden zweiten Punkt von Stufe k−1 ab (gleicher Abtaster `sampleGrid`, gleiche Diagonale).
Render-Stufen sind bandbegrenzt (siehe Generator); LOD 0 und Physik sind identisch. Origin-Shift im 64-m-Raster ab 1024 m.

| Datei | Zuständig |
|---|---|
| `shared/config.ts` | `CELL`, `TILE_SIZE`, `MAX_LOD`, `VIEW_DISTANCE`, `DETAIL_RANGE`, `lodSplit()`, Physik-Kacheln |
| `shared/terrain/` | **Generator** (rein, ohne three.js/Rapier): Noise, Schichten, Presets – siehe unten |
| `shared/terrainHeight.ts` | `sampleTerrainHeightWorld(x, z)` + `sampleGrid()` des aktiven Terrains – **einziger** Abtaster für Physik und Optik |
| `shared/tileGeometry.ts` | Kachel: Positionen, Normalen, Skirts, Indexpuffer + Morph-Daten (grobe Höhe **und** grobe Normale, Morph-Bereich) |
| `render/terrain/LodTerrain.ts` | Quadtree-Auswahl (Hysterese bei Teilung **und** Sichtweite), Worker-Pool, **ein BatchedMesh** (320 feste Plätze, LRU) |
| `render/terrain/tileWorker.ts` | Kachel-Worker (Transfer ohne Kopie) |
| `physics/terrainColliders.ts` | 3×3 Rapier-Heightfields à 64 m (128 Zellen) um das Fahrzeug |

## Generator (`shared/terrain/`)
Unendlich und deterministisch: Höhe = reine Funktion aus Seed + Konfiguration (keine Karte, kein Zustand).

| Datei | Inhalt |
|---|---|
| `noise.ts` | Hash, 2D-Simplex (Gradient-Noise), `fbm` mit Bandbegrenzung, `smoothstep` |
| `types.ts` | `TerrainConfig` (reine Daten), `Layer`, `SampleContext` (Höhe + Masken) |
| `layers/*.ts` | eine Datei je Schicht; `layers/index.ts` ordnet Typ → Fabrik zu |
| `generator.ts` | `createTerrain(config)` → `height(x, z)`, `sampleGrid(...)` |
| `presets.ts` | `DEFAULT_TERRAIN`, `TERRAIN_PRESETS` |
| `index.ts` | öffentlicher Einstieg, `setTerrain()` / `terrain()` (aktives Terrain je Thread) |

Regeln:
- **Bitgleich überall:** nur `+ − × ÷`, `floor`, `sqrt`, `Math.imul`/Bit-Ops. Kein `Math.pow/sin/exp` (engine-abhängig).
  Golden-Value-Test (`tests/generateHeights.test.ts`) – bei absichtlicher Änderung neu eintragen.
- Jede Schicht hat ihren eigenen Seed (Name + Grund-Seed) → neue Schichten ändern bestehende nicht.
- Konfiguration geht per Nachricht an Physik-Worker und Kachel-Worker; jeder Thread baut denselben Generator.
  Auswahl per URL: `?terrain=<preset>&seed=<zahl>`.
- **Bandbegrenzung:** Render-Kacheln lassen Wellenlängen < 2·Zellweite weg (spart Zeit, kein Flimmern);
  Physik rechnet immer voll. Das Morph-Ziel wird deshalb aus der echten Elternstufe abgetastet (Test „Geomorphing-Ziel“).
- Kosten ~1 µs pro Punkt (Welt). Physik-Kacheln: die unter dem Fahrzeug sofort, Nachbarn stückweise mit
  ~2500 Punkten pro Physik-Schritt (~2,5 ms) → kein Hänger im Worker.

### Schichten
| Schicht | Datei | Wirkung | Masken |
|---|---|---|---|
| `continent` | `layers/continent.ts` | Land/Meer aus Rauschen mit 160 km Wellenlänge; Schwelle −0,06 → ~60 % Land. Land 0 … 300 m (flache Küsten), Schelf −150 m, Tiefsee bis −1500 m | `land`, `coast`, `inland` |
| `mountains` | `layers/mountains.ts` | Gebirgszüge: Maske (90 km) × `inland`, quadratisch auslaufend (Vorberge). Form = 30 % glatte Masse (25 km) + 70 % Grate (5 gerundete ridged-Oktaven ab 12 km, Kamm-Rundung 0,12) + schwache Felsstruktur nur an Kämmen; Warp 1,5 km, Streckung 1,3; bis 3000 m | `mountain` |
| `detail` | `layers/detail.ts` | Bodenwellen (50 m, 5 Oktaven) | – |

Grenzen (`limits`): Gipfel weich bis 3000 m (asymptotisch ab 2700), Meeresboden hart bei −1500 m.

### Presets
| Name | Inhalt |
|---|---|
| `world` (= `default`) | Kontinent + Gebirge + Bodenwellen ±3 m |
| `hills` | nur Hügel 1,5 … 7,5 m – Fahrwerks-, Physik- und LOD-Tests (`tests/setup.ts`) |

Start: ohne `?x/?z` sucht `findLand(0, 0)` den nächsten ebenen Landpunkt (5 … 400 m, Gefälle < 15 %).
Gebirge zum Anschauen: `?x=858000&z=897000` (~2460 m).

Gebirge-Gestaltung (Lehren): viele scharfe Grat-Oktaven (`1 − |n|`) ergeben Zacken; starke Streckung/Warp ergibt
Riefen; ungedämpfte Feinform wirkt wie zerknülltes Papier. Deshalb: wenige gerundete Grate, glatte Flanken,
Feinform nur an Kämmen.

Geplant: `regions` (Ebene, Hügelland, Alpin, Badlands, Fremdartig), `hills`, ortsabhängiges `detail`, `materials`.

## Gegen Flackern / Popping
- **LOD-Abstand in 3D:** Abstand Kamera ↔ Kachel über deren Höhenspanne (`bounds`) – ein Berg, der 2 km höher liegt,
  wird nicht zu fein/zu grob gewählt.
- **Skirts nach Gelände:** Tiefe = 2·Zellweite + 0,5·2^k + 2·größter Morph-Ausschlag → keine Risse an steilen Hängen.
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
~120–160 Kacheln sichtbar (bis 32 km), **1 Draw Call**, ~1,3 Mio. Dreiecke. Terrain wirft keine Schatten.
Erstaufbau im Gebirge ~1,3 s Rechenzeit, verteilt auf bis zu 4 Kachel-Worker.

## Später
- Fern-Physik: gröbere Heightfield-Ringe (Zellweite 2^k · 0,5 m) über `sampleGrid`, eigene Collision-Group
  (nur ferne Objekte), damit das Fahrzeug nicht doppelt kollidiert.
