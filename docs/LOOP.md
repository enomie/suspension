# Frame-Ablauf

## Threads
| Thread | Datei | Aufgabe |
|---|---|---|
| Physik-Worker | `src/sim/physicsWorker.ts` → `src/sim/Simulation.ts` | Rapier-Welt, Boden-Heightfields, Fahrzeug, eigener Floating Origin; **eigener 120-Hz-Takt** (Wanduhr, `StepClock`), Snapshot pro Schritt |
| Terrain-Worker (≤ 4) | `src/terrain/terrainWorker.ts` | LOD-Kacheln (Höhen, Normalen, Morph) |
| Haupt-Thread | `src/main.ts` | Input, Interpolation, Kamera, LOD-Auswahl, Rendern (`renderer.setAnimationLoop`) |

Fallback ohne Worker: `?worker=0` (gleiche Snapshot-Strecke, Physik im Haupt-Thread – zum Vergleichen).

## Haupt-Thread pro Frame (`src/main.ts`)
| # | Schritt | Modul |
|---|---|---|
| 1 | Hotkeys (1–0 Preset, R Reset) → Worker; Input nur bei Änderung senden | `sim/PhysicsClient.ts` |
| 2 | Snapshot bei **`now − delay`** zeitlich interpolieren (zwei umgebende Physik-Schritte) | `sim/PhysicsClient.ts`, `sim/snapshot.ts` |
| 3 | Meshes setzen (absolute Posen − ORIGIN) | `sim/VehicleView.ts` |
| 4 | Floating-Origin-Shift (Haupt-Thread, unabhängig vom Worker) | `world/originShift.ts` |
| 5 | Kamera + Sonne folgen | `app/cameraRig.ts`, `app/sunRig.ts` |
| 6 | LOD-Terrain (Auswahl nur bei Kamerabewegung/neuen Kacheln) | `terrain/lodTerrain.ts` |
| 7 | HUD + Render (Reversed-Z) | `debug/telemetry.ts` |

## Snapshots / Interpolation
- Snapshot = `Float64Array` per Transfer: Generation, Zeitstempel, Telemetrie, **absolute** Posen aller Körper.
- `VehicleView` baut dasselbe Fahrzeug in einer leeren Rapier-Welt → gleiche Körper-Reihenfolge wie im Worker (`poseBodies`).
- `delay` = beobachteter Abstand zum neuesten Snapshot (langsam abklingendes Maximum, ~8–12 ms):
  es liegt immer ein neuerer Snapshot vor → nie Extrapolation, nie Rückwärtssprung.
- Generation wechselt bei Respawn/Preset: Snapshots des alten Fahrzeugs werden verworfen (keine „alten Frames“).
- HUD zeigt Modus, ms pro Physik-Schritt und aktuelle Interpolations-Verzögerung.

## Gegen Flackern / Stöße
- Fahrzeug unsichtbar bis zum ersten Snapshot seiner Generation.
- Chassis-Collider = sichtbarer Leiterrahmen (abgerundet). Früher volle unsichtbare Box → setzte auf Wellen auf,
  verhakte an Dreieckskanten („unsichtbare Wand“, bis −1000 m/s²). Test: `tests/invisibleWall.test.ts`.
- Reversed-Z, LOD-Hysterese (+15 %), CDLOD-Geomorphing, Schatten auf Texel gerastert.

Debug: `__dbg` (physics, terrain, origin, ORIGIN, camera, controls, renderer, scene, sun, vehicle).
