# Architektur

Drei Threads, vier Schichten. Die Ordner trennen strikt, wer was importieren darf:

| Ordner | Läuft in | Darf importieren | Inhalt |
|---|---|---|---|
| `shared/` | überall | nur `shared/` | Konstanten (`config`), Floating Origin (`origin`, `originShifter`), Geländehöhe (`terrainHeight`), Kachel-Geometrie (`tileGeometry`), Takt (`stepClock`), Nachrichten (`protocol`), Snapshot-Format (`snapshot`), Fahrzeug-Typen (`vehicleSpec`, `vehicleLayout`) |
| `physics/` | Physik-Worker | `shared/`, Rapier | `worker.ts` (Einstieg), `Simulation.ts`, `terrainColliders.ts`, `vehicle/` (Aufbau, Aufhängungen, Antrieb, Lenkung, Presets, `layout.ts`) |
| `render/` | Haupt-Thread | `shared/`, three.js | `scene.ts` (Renderer/Kamera/Licht), `CameraRig`, `SunRig`, `terrain/` (LOD + Kachel-Worker), `vehicle/` (Optik aus Layout) |
| `app/` | Haupt-Thread | alles außer `physics/` (Ausnahme: dynamischer Fallback) | `PhysicsClient` (Worker-Anbindung + Interpolation), `keyboard`, `hud`, `debug` |

`main.ts` verdrahtet nur.

**Öffentliche Einstiege** (für andere Projekte nur diese importieren): `shared/terrain/index.ts`,
`physics/vehicle/index.ts`, `render/vehicle/index.ts`, `render/terrain/index.ts`. Übernahme:
[INTEGRATION_TERRAIN.md](INTEGRATION_TERRAIN.md), [INTEGRATION_VEHICLE.md](INTEGRATION_VEHICLE.md).

## Datenfluss
```
physics/worker ──'vehicle' {layout}──▶ app/PhysicsClient ──▶ render/vehicle/VehicleVisual (Meshes aus Layout)
               ──'snapshots' [Float64Array]──▶ Interpolation nach Zeit ──▶ VehicleVisual.apply()
app/keyboard ──'input' / 'spawn'──▶ physics/worker
```
- **Layout** (`shared/vehicleLayout.ts`): reine Daten (Spec, Körper-Indizes, Lenker-Punkte, Montageplatten-Punkte).
  Der Haupt-Thread lädt kein Rapier mehr (außer `?worker=0`).
- **Snapshot** (`shared/snapshot.ts`): Generation, Zeitstempel, Telemetrie, absolute Posen je Körper-Index.

## Haupt-Thread pro Frame (`main.ts`)
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

Neue Terrain-Kacheln (Kachel-Worker) und Snapshots (Physik-Worker) kommen zwischen zwei Frames an und werden im
nächsten Frame übernommen. Physik-Worker: fester 120-Hz-Takt nach Wanduhr (`shared/stepClock.ts`), ein Snapshot pro Schritt.

## Instancing und TSL
- **TSL-Materialien** liegen in `render/tsl/` (bisher: `terrainMaterial.ts` mit Debug-Uniform `morphEnabled`). Neue Node-Materialien dort ablegen, nicht inline in Renderern.
- **Instancing-Muster:** `render/vehicle/linkVisual.ts` – ein `InstancedMesh` je (Geometrie, Material), Anzahl vorab aus dem Layout, Matrix pro Frame per `setMatrixAt(i, Matrix4.compose(...))`, danach `instanceMatrix.needsUpdate = true`.
- **Fallen:** `frustumCulled = false` setzen (Bounding-Sphere wird nicht nachgeführt); Posen sind Render-lokal (absolut − `ORIGIN`, Floating Origin); `count` ≤ Kapazität; für per-Instanz-Farbe `setColorAt` bzw. in TSL `instancedBufferAttribute`/`storage()` + `instanceIndex`.

## Bekannte Ursachen früherer Flacker-Probleme (nicht wieder einbauen)
| Symptom | Ursache | Absicherung |
|---|---|---|
| „unsichtbare Wand“ | unsichtbarer Chassis-Collider größer als der Rahmen, hakte an Dreieckskanten | `tests/invisibleWall.test.ts` |
| Terrain flackert beim Fahren | Verfeinerung verlangte den ganzen Teilbaum → Rückfall bis zur Wurzelkachel | Test „LOD beim Fahren“ |
| Licht springt bei LOD-Wechsel | nur Höhe gemorpht, nicht die Normale | Morph von Höhe **und** Normale |
| Kacheln pendeln an Grenzen | festes 3×3-Wurzelfenster, Sichtweite ohne Hysterese | Test „camera jitter …“ |

## Debug (Flackern eingrenzen)
| Taste | Schalter | Was es eingrenzt |
|---|---|---|
| F1 | Schatten an/aus | blitzt es noch? → nicht der Schatten |
| F2 | Terrain-Geomorphing an/aus | Terrain-Flackern durch Morph? |
| F3 | Fahrzeug-Interpolation an/aus (aus = immer neuester Snapshot) | Auto-Aufblitzen durch Interpolation? |
| F4 | LOD-Auswahl einfrieren | Terrain-Flackern durch Kachelwechsel? |
| F5 | Terrain-Drahtgitter | Kachelgrenzen / Skirts sichtbar machen |
| F6 | Sonne einfrieren (folgt dem Auto nicht) | Schatten-Blitzen durch Mitführen der Schattenkamera? |
| F7 | Schattenfilter durchschalten (PCF → weich → VSM → hart) | Schatten-Blitzen durch Filter/Bias? |

Vorab abschalten per URL: `?debug=shadows,morph,interp`. HUD zählt Frame-Ausreißer (> 2× Mittel).
Weitere URL-Parameter: `?worker=0`, `?dpr=1`, `?x=…&z=…`.
