# Frame-Ablauf

## Threads
| Thread | Datei | Aufgabe |
|---|---|---|
| Physik-Worker | `src/physics/worker.ts` → `src/physics/Simulation.ts` | Rapier-Welt, Boden-Heightfields, Fahrzeug, eigener Floating Origin; **eigener 120-Hz-Takt** (Wanduhr, `StepClock`), Snapshot pro Schritt |
| Terrain-Worker (≤ 4) | `src/render/terrain/tileWorker.ts` | LOD-Kacheln (Höhen, Normalen, Morph) |
| Haupt-Thread | `src/main.ts` | Input, Interpolation, Kamera, LOD-Auswahl, Rendern (`renderer.setAnimationLoop`) |

Fallback ohne Worker: `?worker=0` (gleiche Snapshot-Strecke, Physik im Haupt-Thread – zum Vergleichen).

## Haupt-Thread pro Frame (`src/main.ts`)
| # | Schritt | Modul |
|---|---|---|
| 1 | Hotkeys (1–0 Preset, R Reset) → Worker; Input nur bei Änderung senden | `app/PhysicsClient.ts` |
| 2 | Snapshot bei **`now − delay`** zeitlich interpolieren (zwei umgebende Physik-Schritte) | `app/PhysicsClient.ts`, `shared/snapshot.ts` |
| 3 | Meshes setzen (absolute Posen − ORIGIN) | `render/vehicle/VehicleVisual.ts` |
| 4 | Floating-Origin-Shift (Haupt-Thread, unabhängig vom Worker) | `shared/originShifter.ts` |
| 5 | Kamera + Sonne folgen | `render/CameraRig.ts`, `render/SunRig.ts` |
| 6 | LOD-Terrain (Auswahl nur bei Kamerabewegung/neuen Kacheln) | `render/terrain/LodTerrain.ts` |
| 7 | HUD + Render (Reversed-Z) | `app/hud.ts` |

## Snapshots / Interpolation
- Snapshot = `Float64Array` per Transfer: Generation, Zeitstempel, Telemetrie, **absolute** Posen aller Körper.
- Der Worker schickt beim Spawn ein **Layout** (reine Daten); `VehicleVisual` baut daraus die Meshes. Körper = Index im Snapshot.
- `delay` = größter Abstand zum neuesten Snapshot der letzten 0,5 s (+0,5 ms), steigt sofort, sinkt weich:
  es liegt immer ein neuerer Snapshot vor → nie Extrapolation. Render-Zeit ist zusätzlich monoton (läuft nie zurück).
- Generation wechselt bei Respawn/Preset: Snapshots des alten Fahrzeugs werden verworfen (keine „alten Frames“).
- HUD zeigt Modus, ms pro Physik-Schritt und aktuelle Interpolations-Verzögerung.

## Gegen Flackern / Stöße
- Fahrzeug unsichtbar bis zum ersten Snapshot seiner Generation.
- Chassis-Collider = sichtbarer Leiterrahmen (abgerundet). Früher volle unsichtbare Box → setzte auf Wellen auf,
  verhakte an Dreieckskanten („unsichtbare Wand“, bis −1000 m/s²). Test: `tests/invisibleWall.test.ts`.
- Reversed-Z, LOD-Hysterese (+15 %), CDLOD-Geomorphing, Schatten auf Texel gerastert.

Debug-Tasten F1–F5 siehe `docs/ARCHITECTURE.md`. Konsole: `__dbg` (physics, terrain, origin, ORIGIN, debug, camera, controls, renderer, scene, sun, vehicle).
