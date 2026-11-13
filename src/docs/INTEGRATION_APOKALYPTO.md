# Terrain in apokalypto – Übernahme und Stand

Konkrete Umsetzung von [INTEGRATION_TERRAIN.md](INTEGRATION_TERRAIN.md) im Projekt **apokalypto**
(Repo `enomie/apokalypto`). Gewählt: **Variante 3, schrittweise** – Unterbau + Generator aus suspension,
die apokalypto-Merkmale (Oase, Wasserwege, Dünen …) werden danach einzeln als Generator-Schichten nachgebaut.

| Schritt | Stand | apokalypto-Commit |
|---|---|---|
| 1. Generator, LOD-Optik, 0,5-m-Physik-Kacheln | **erledigt** | `a5e0afdd` |
| 1b. Physik-Worker baut Terrain-Kacheln selbst (wie suspension) | **erledigt** | Branch `claude/focused-cerf-gj1kcv` |
| 2. apokalypto-Merkmale als Schichten | offen – Liste in §7 | – |

Vorher hatte apokalypto 3×3 Chunks à 8192 m mit 256 Unterteilungen (**32 m Zellweite**, Optik = Physik).
Jetzt: Optik 0,5 m nah bis 32 km fern (1 Draw Call), Physik 0,5 m in 64-m-Kacheln.

## 1. Datei-Zuordnung suspension → apokalypto
Alles unter `apokalypto/src/game/game-terrain/`. Benennung nach apokalypto-Konvention (`game-terrain-…`, Importe mit `.ts`).

| suspension | apokalypto | Änderung beim Portieren |
|---|---|---|
| `shared/terrain/noise.ts` | `game-terrain-gen/game-terrain-gen-noise.ts` | unverändert |
| `shared/terrain/types.ts`, `generator.ts`, `presets.ts`, `index.ts` | `game-terrain-gen/game-terrain-gen-{types,generator,presets,index}.ts` | unverändert |
| `shared/terrain/layers/*.ts` | `game-terrain-gen/layers/game-terrain-gen-layer-*.ts` | Lint: `ctx.masks.inland ?? 1` → `'inland' in ctx.masks ? … : 1` |
| `shared/terrainHeight.ts` (+ `setTerrain`) | `game-terrain-gen/game-terrain-gen-world.ts` | **Welt-Versatz** (§3), statisches Preset statt Init-Nachricht |
| `shared/config.ts` (LOD-Teil) | `game-terrain-lod/game-terrain-lod-config.ts` | Sichtweite = Kamera-Far 20 km (§5) |
| `shared/config.ts` (Physik-Teil) | `game-terrain-mesh/game-terrain-mesh-config.ts`, `game-terrain-stream-config.ts` | Radius 6 statt 1 (§4) |
| `shared/tileGeometry.ts` | `game-terrain-lod/game-terrain-lod-tile-geometry.ts` | + Vertex-Farbe `color` und Morph-Ziel `morphColor` |
| `render/terrain/LodTerrain.ts` | `game-terrain-lod/game-terrain-lod.ts` (`GameTerrainLod`) | absolute Platzierung im `worldGroup`, `primeAround()` für den Boot |
| `render/terrain/tileWorker.ts` | `game-terrain-lod/game-terrain-lod-tile.worker.ts` | ohne `terrain`-Nachricht |
| `terrainMaterial()` | `game-terrain-look/game-terrain-look-material.ts` → `buildGameTerrainLodMaterial()` | Morph + apokalypto-Look-Kette (§5) |
| `physics/terrainColliders.ts` | `game-physics-worker/environment/game-physics-worker-environment-terrain.ts` (`PhysicsWorkerTerrainTiles`) | Kacheln unter **jedem** dynamischen Körper statt um ein Fahrzeug (§4) |
| `shared/origin.ts`, `originShifter.ts` | – **nicht übernommen** | apokalypto hat eigenes Floating Origin (§3) |

## 2. Eine Höhenfunktion für alles
`gameTerrainHeightAtWorld(x, z)` (`game-terrain-height/game-terrain-height-base.ts`) liest den Generator. Er ist rein und
läuft in jedem Thread – es gibt **keine Höhen-Grids, keinen SAB und keine Bereitschafts-Abfragen** mehr:

| Nutzer | Quelle |
|---|---|
| Physik-Heightfields | Physik-Worker, `gameTerrainGenSampleRowsInto` (volle Auflösung) |
| LOD-Optik | Kachel-Worker, `gameTerrainGenSampleGrid` (bandbegrenzt) |
| Spawn, Fahrzeug-Platzierung, Props, Dekor, Flora, Minimap | `gameTerrainHeightAtWorld` / `session.sampleCoarseTerrainYAt` |
| Biom-Farben (`gameTerrainVertexAlbedoRgbAtWorld`) | im Kachel-Worker je Vertex |

Physik-Kacheln liegen auf exakt denselben Punkten; zwischen den Punkten interpoliert Rapier linear (Abweichung zur
Generator-Höhe < 1 cm bei 0,5-m-Raster).

## 3. Koordinaten, Floating Origin, Versatz
| Thema | suspension | apokalypto |
|---|---|---|
| Achsen / Einheit | Y oben, 1 = 1 m, Meer y = 0 | gleich (`GAME_WATER_LEVEL_Y_M = 0`) → Kontinent-Schicht passt ohne Umrechnung |
| Floating Origin | `ORIGIN`, Kacheln werden beim Shift neu platziert | `worldGroup.position = −origin`, Kinder absolut → LOD-Kacheln liegen **absolut** im `worldGroup`, kein Neu-Platzieren |
| Kamera für LOD | lokal + `ORIGIN` | `presentScratch.cameraView.absolute*` (Present-Lane, nach Kamera-Update) |
| Weltlage | Start per `findLand(0, 0)` | fester **Versatz** `GAME_TERRAIN_GEN_OFFSET_X/Z_M = (400 000, −320 000)` |

Warum Versatz statt `findLand`: apokalypto hat Spawn-Presets mit festen Koordinaten (±9 km um 0,0). Der Versatz legt
dieses Gebiet auf eine Hochebene im Landesinneren: im Umkreis ±12 km überall Land (247 … 330 m), Gipfel bis ~2900 m
innerhalb 30 km (höchster bei Welt (8500, 20750)). Gesucht per Skript über ein 20-km-Raster (Bedingung: Land im ganzen
Preset-Gebiet, Gebirge in Sichtweite). Neue Seeds/Presets → Suche wiederholen.

Biom-Höhenbänder passen ohne Änderung: kalt ab 500 m, Schnee ab 1000 m → Gebirge werden kalt/verschneit, Hochebene bleibt temperate.

## 4. Physik-Kacheln (gehören dem Physik-Worker)
Kachel = 128 Zellen × 0,5 m = 64 m (= 2×2 LOD-0-Kacheln, gleiche Punkte, gleiche Diagonale wie Rapier).
Der Physik-Worker baut sie selbst, vor jedem `world.step()` (`PhysicsWorkerCore.updateTerrainTiles`):

| Regel | Wert | Grund |
|---|---|---|
| Sofort (im selben Schritt) | Kachel unter jedem aktiven dynamischen Körper + unter seiner Position in 0,25 s | nichts fällt je durch fehlenden Boden; 10–20 ms je Kachel |
| Verteilt | Ring Radius 1 (3×3, ±96 m) um jeden Körper, nächste zuerst, 2048 Höhen pro Schritt | wie suspension (`tiles.update(…, 2500)`) |
| Behalten | Radius 2 um jeden Körper | Hysterese |
| Entladen | max. 4 pro Schritt, Constraints am Körper werden vorher gelöst | |
| Fokus neu sammeln | alle 8 Schritte (`world.forEachRigidBody`, dynamisch + aktiv) | dazwischen nur „Kachel unter Körper“ |

Unterschied zu suspension: dort ein Fahrzeug, hier alle Körper (Character, Fahrzeuge, Props, Equipment) – deshalb
keine Ring-Größe nach Streaming-Tier mehr nötig. Nach einem Worker-Neustart (Recovery) baut der neue Worker die
Kacheln von selbst wieder auf.

Haupt-Thread erfährt Änderungen nur per Antwort (`TERRAIN_CHUNK_READY` / `TERRAIN_CHUNK_REMOVED`) →
`game-terrain-mesh-physics-registry.ts` (Tether-Anker, Kontakt-Zuordnung, Telemetrie `Chunks=`).
Topologie-Änderungen markieren die Raycast-Controller nahe Fahrzeuge zur Neuerstellung (wie früher bei `TERRAIN_CHUNK_ADD`).

Entfernt gegenüber Schritt 1: `GameTerrainChunkRing`, Höhen-Grid-SAB (Layout, Views, Slots, Bind), Terrain-Worker-Job
`computeHeightTile`, `TERRAIN_CHUNK_ADD`/`REMOVE`, `INIT_TERRAIN_HEIGHT_GRID_SAB`, Grid-Interpolation.

Das **8192-m-Raster bleibt** als „Makro-Chunk“ (`GAME_TERRAIN_MACRO_CHUNK_M`, `gameTerrainMacro…` in
`game-terrain-chunk-coords.ts`) für Wasser-Ebenen, Cell-Streaming-Unterzellen und Float-Origin-Recenter (4096 m).
`gameTerrain…Chunk…` ohne „Macro“ meint jetzt immer die 64-m-Physik-Kachel.

## 5. LOD-Optik und Material
- `GameTerrainLod` gehört der `GameTerrainSession` (`session.lod`), `bindWorldGroup` hängt das BatchedMesh ein,
  `tickLodAtCamera(absX, absY, absZ)` läuft in `game-world-present-chunk-surface-lane.ts`.
- Boot: `bootGroundAtSpawn` füllt nur noch das LOD (`primeAround`, max. 8 s, Rest streamt grob → fein nach); Physik baut der Worker beim Spawnen der Körper.
- Name des BatchedMesh = `GAME_TERRAIN_CHUNK_DRAW_MESH_NAME` → der Boot-Shader-Compile findet es wie früher die Chunks.
- **Material** (`buildGameTerrainLodMaterial`): CDLOD-Morph wie suspension (Höhe + Normale) **plus Farbe**
  (`morphColor`, sonst springt die Biom-Farbe an Hängen beim Kachelwechsel, weil sie von der Normalen abhängt).
  Darauf die bestehende apokalypto-Kette: Near-Grain (Farbe + Normale), nasser Ufersand, Wasser-Tönung, Fahrspuren.
  `tslGameTerrainNearSandNormal` hat dafür den optionalen Parameter `baseNormalWorld` (gemorphte Normale).
- Sichtweite = `GAME_SKY_CAMERA.FAR_CLIP_M` (20 km) statt 32 km; apokalypto nutzt kein Reversed-Z
  (siehe §8, offen).

## 6. Stolpersteine (beim Einbau aufgetreten)
| Symptom | Ursache | Lösung / Ort |
|---|---|---|
| (Schritt 1) Rapier „unreachable“-Panic nach 2–11 Schritten, Fahrzeuge mit `terrainY = NaN` | Erster Present-Frame las PLAYER_ANCHOR = (0,0): Boot-Seed setzte `interp`, aber nicht `previousPose/currentPose` → Physik-Ring zentrierte auf 0,0 und entlud die Kacheln am Spawn. Beim alten 8-km-Chunk lagen 0,0 und Spawn im selben Chunk – Fehler unsichtbar | `seedPlayerAnchorPresentInterpAtBoot` setzt jetzt auch die Pose-Paare (`game-world-player-anchor.ts`) |
| (Schritt 1) Fahrzeuge nahe Spawn ohne Boden | Ring um den Spieler deckte nicht alle Körper ab | Physik-Worker baut Kacheln unter jedem Körper (§4) |
| Minimap schwarz | las nur geladene Grids | liest den Generator |
| Character fällt nach freiem Fall durchs Terrain (mit Fallschirm nicht) | harter Aufprall → Ragdoll aus zwei kleinen Kugeln (≈ 0,15 m) startet mit Aufprallgeschwindigkeit (≈ −31 m/s) → tunnelt in Rapier durch das Heightfield, auch mit CCD und auch bei grobem Raster (isoliert nachgestellt) | **offen** – Ragdoll-Einstieg (`game-physics-worker-character-ragdoll-chain.ts`): Startgeschwindigkeit begrenzen bzw. knapp über dem Boden starten |
| „Chunk“ meinte zwei Dinge | Wasser/Streaming/Origin brauchen weiter 8 km, Physik 64 m | Makro-Chunk getrennt (§4) |
| Headless-Test schwarz | SwiftShader-WebGPU scheitert an `createBuffer`-Limits (auch ohne diese Änderung) | Sichtprüfung mit `WebGPURenderer({ forceWebGL: true })`, gleiche TSL-Materialien |

## 7. Schritt 2: apokalypto-Merkmale als Schichten
Die alte Höhenkette (`game-terrain-height/…`) wird **nicht mehr angewendet**, ist aber noch im Code, weil die
Biom-Masken für Oase und Dystopie sie importieren. Quelle für den Nachbau: apokalypto-Commit `6f56bc60`
(vor der Umstellung; dort auch das gelöschte `game-terrain-height-waterways.ts`).

Muster je Merkmal (siehe [INTEGRATION_TERRAIN.md §2 Variante A](INTEGRATION_TERRAIN.md)): Schicht-Datei in
`game-terrain-gen/layers/`, Typ in `game-terrain-gen-types.ts` + `layers/game-terrain-gen-layer-index.ts`,
Eintrag im Preset, Masken in `ctx.masks` für spätere Schichten und für die Biom-Färbung. Regeln:
nur `+ − × ÷`, `floor`, `sqrt`, Bit-Ops; `ctx.minWavelength` beachten (Bandbegrenzung); eigener Seed je Schicht.

| Alt (apokalypto) | Neue Schicht | Hinweise |
|---|---|---|
| `…-height-dunes.ts`, `…-sand-ripples.ts`, `…-feature-template.ts` | `dunes` (+ Rippel als feine Oktaven) | Maske aus Wüsten-Makro (`gameTerrainBiomeMacro01`) statt eigener Höhenabhängigkeit; Rippel < 2 m Wellenlänge fallen in LOD 0 per Bandbegrenzung weg → nur Physik/nah |
| `…-valleys.ts` | `valleys` | nach `mountains`, liest `ctx.masks.mountain` |
| `…-middle-mountains.ts` | als Option der `mountains`-Schicht oder eigene `hills` | suspension plant `regions` (Hügelland) |
| `…-obstacles.ts`, `…-micro-spikes.ts` | `obstacles` | kleinräumig → nur Physik/LOD 0 relevant |
| `…-oasis.ts` | `oasis` | setzt `ctx.masks.oasis`; Biom-Maske danach aus der Schicht lesen statt aus der alten Höhenkette |
| `…-waterways.ts` (gelöscht) | `waterways` | schneidet unter y = 0? → Wasser-Ebenen prüfen |
| `…-dystopia.ts` | `dystopia` | wie Oase: Maske aus der Schicht |
| `GAME_TERRAIN_SURFACE_Y_M` (10 m) | – | entfällt, wenn Oase/Dystopie umgestellt sind |

Danach: alte Höhenkette + `GAME_TERRAIN_SURFACE_Y_M` löschen, Golden-Value-Test wie `tests/generateHeights.test.ts`
in apokalypto anlegen (dort gibt es noch keinen Vitest – Smoke-Skript in `_Scripts/` als Alternative).

## 8. Offen
- **Reversed-Z / Sichtweite 32 km**: apokalypto-Kamera far = 20 km mit Standard-Tiefe. Für 32 km wie suspension:
  `reversedDepthBuffer: true` am Renderer, dann Post-Processing/Shader prüfen, die Tiefe lesen (Wasser, `game-scene-resolved-depth`).
- **Ragdoll tunnelt** durchs Heightfield (§6).
- **Floating Origin**: der Physik-Worker rechnet Szene = absolut (Origin im Worker nie gesetzt). Solange
  `CELL_STREAMING_FLOAT_ORIGIN_GATE` aus ist, stimmt das; beim Einschalten braucht der Worker den Origin (ohnehin nötig für `ORIGIN_SHIFT`).
- `_Scripts/terrain-boot-hill-spawn-smoke-check.ts` wurde gelöscht (war schon vorher nicht lauffähig, testete den alten Chunk-Ring).
- `vehicle-manifest-stream-in-placement-gate-smoke-check.ts` schlägt fehl – unabhängig vom Terrain (auch auf `lokal-arbeit` allein).
- Leistung im echten Browser messen (Boot-Füllung headless/SwiftShader: LOD 3–8 s CPU, im Browser mit GPU deutlich weniger erwartet).

## 9. Zahlen (headless, SwiftShader, nur CPU)
| Messung | Wert |
|---|---|
| LOD-Erstfüllung am Spawn (3 Kachel-Worker) | 162 sichtbare / 216 gebaute Kacheln, 4,3 … 7,6 s |
| LOD am Gebirge | 149 sichtbare Kacheln, 5,4 s |
| Physik-Kachel (64 m, 16 641 Höhen) | 10 ms (Ebene) … 20 ms (Gebirge) |
| Physik-Kacheln am Spawn (7 dynamische Körper) | 21 |
| Höhe am Spawn (794, 74) | ~287 m |
