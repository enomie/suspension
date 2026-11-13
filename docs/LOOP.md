# Frame-Ablauf (`src/main.ts`)

| # | Schritt | Modul |
|---|---|---|
| 1 | Hotkeys (1–0 Aufhängung, R Reset) | `main.ts` |
| 2 | Physik-Kacheln um das Fahrzeug nachladen | `terrain/physicsTiles.ts` |
| 3 | Fester Physik-Takt 120 Hz (max. 4 Schritte/Frame): Input → Motoren, Posen merken, `world.step()` | `app/fixedStep.ts` |
| 4 | Telemetrie (Federweg, Kräfte, Raddrehzahl) | `vehicle/Vehicle.ts` |
| 5 | Floating-Origin-Shift (ab 1 km) | `world/originShift.ts` |
| 6 | Visuals **interpoliert** zwischen den letzten zwei Physik-Schritten (alpha) | `vehicle/interpolation.ts` |
| 7 | Kamera folgt (Orbit frei), Sonne folgt (auf Shadow-Texel gerastert, Bias) | `app/cameraRig.ts`, `app/sunRig.ts` |
| 8 | LOD-Terrain (Worker-Pool) | `terrain/lodTerrain.ts` |
| 9 | HUD + Render (Reversed-Z-Tiefenpuffer) | `debug/telemetry.ts` |

## Gegen Flackern (geprüft 2026-11-13)
- Render-Interpolation: ohne sie springt das Fahrzeug bei 100–144 fps bis 55 mm/Frame, mit ihr < 0,1 mm.
- Fahrzeug im Bild bei Fahrt + Origin-Shift: 0,00 px Versatz (Messung im Browser).
- Reversed-Z statt logarithmischer Tiefe; Federn als geschlossene Zylinder; Rahmen-Teile ohne deckungsgleiche Flächen.
- LOD-Hysterese (+15 %), Schatten auf Texel gerastert + `bias`/`normalBias`.
- Antrieb mit Schlupfbegrenzung (`MAX_SLIP_SPEED` in `parts/drive.ts`), sonst dreht ein entlastetes Rad bis vMax hoch.

Debug: `__dbg` (world, terrain, physicsTiles, origin, ORIGIN, camera, controls, renderer, scene, sun, vehicle).
