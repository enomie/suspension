# Architektur

Drei Threads, vier Schichten. Die Ordner trennen strikt, wer was importieren darf:

| Ordner | Läuft in | Darf importieren | Inhalt |
|---|---|---|---|
| `src/shared/` | überall | nur `shared/` | Konstanten (`config`), Floating Origin (`origin`, `originShifter`), Geländehöhe (`terrainHeight`), Kachel-Geometrie (`tileGeometry`), Takt (`stepClock`), Nachrichten (`protocol`), Snapshot-Format (`snapshot`), Fahrzeug-Typen (`vehicleSpec`, `vehicleLayout`) |
| `src/physics/` | Physik-Worker | `shared/`, Rapier | `worker.ts` (Einstieg), `Simulation.ts`, `terrainColliders.ts`, `vehicle/` (Aufbau, Aufhängungen, Antrieb, Lenkung, Presets, `layout.ts`) |
| `src/render/` | Haupt-Thread | `shared/`, three.js | `scene.ts` (Renderer/Kamera/Licht), `CameraRig`, `SunRig`, `terrain/` (LOD + Kachel-Worker), `vehicle/` (Optik aus Layout) |
| `src/app/` | Haupt-Thread | alles außer `physics/` (Ausnahme: dynamischer Fallback) | `PhysicsClient` (Worker-Anbindung + Interpolation), `keyboard`, `hud`, `debug` |

`src/main.ts` verdrahtet nur.

## Datenfluss
```
physics/worker ──'vehicle' {layout}──▶ app/PhysicsClient ──▶ render/vehicle/VehicleVisual (Meshes aus Layout)
               ──'snapshots' [Float64Array]──▶ Interpolation nach Zeit ──▶ VehicleVisual.apply()
app/keyboard ──'input' / 'spawn'──▶ physics/worker
```
- **Layout** (`shared/vehicleLayout.ts`): reine Daten (Spec, Körper-Indizes, Lenker-Punkte, Rahmen-Konsolen).
  Der Haupt-Thread lädt kein Rapier mehr (außer `?worker=0`).
- **Snapshot** (`shared/snapshot.ts`): Generation, Zeitstempel, Telemetrie, absolute Posen je Körper-Index.

## Debug (Flackern eingrenzen)
| Taste | Schalter | Was es eingrenzt |
|---|---|---|
| F1 | Schatten an/aus | blitzt es noch? → nicht der Schatten |
| F2 | Terrain-Geomorphing an/aus | Terrain-Flackern durch Morph? |
| F3 | Fahrzeug-Interpolation an/aus (aus = immer neuester Snapshot) | Auto-Aufblitzen durch Interpolation? |
| F4 | LOD-Auswahl einfrieren | Terrain-Flackern durch Kachelwechsel? |
| F5 | Terrain-Drahtgitter | Kachelgrenzen / Skirts sichtbar machen |

Vorab abschalten per URL: `?debug=shadows,morph,interp`. HUD zählt Frame-Ausreißer (> 2× Mittel).
Weitere URL-Parameter: `?worker=0`, `?dpr=1`, `?x=…&z=…`.
