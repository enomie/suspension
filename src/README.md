# src – Wegweiser

Dieser Ordner ist **selbsterklärend kopierbar**: Code und Doku liegen zusammen. Wer ihn in ein anderes Projekt
übernimmt (auch umbenannt), findet hier alles zum Abgleichen.

## Was liegt wo
| Ordner | Läuft in | Abhängigkeiten | Inhalt | Doku |
|---|---|---|---|---|
| `shared/` | überall | keine | Konstanten, Floating Origin, Snapshot-Format, Protokoll, Fahrzeug-Typen | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| `shared/terrain/` | überall | keine | **Terrain-Generator** (deterministisch, Schichten) | [docs/TERRAIN.md](docs/TERRAIN.md) |
| `physics/` | Physik-Worker | Rapier | Simulation, Boden-Collider, Worker-Einstieg | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| `physics/vehicle/` | Physik | Rapier, three.js-Mathe | **Fahrzeug-Baukasten** (10 Aufhängungen) | [docs/VEHICLE_KIT.md](docs/VEHICLE_KIT.md) |
| `render/terrain/` | Haupt-Thread | three.js (WebGPU/TSL) | **LOD-Terrain** (1 Draw Call, Geomorphing, Kachel-Worker) | [docs/TERRAIN.md](docs/TERRAIN.md) |
| `render/vehicle/` | Haupt-Thread | three.js | Fahrzeug-Optik aus Daten-Layout | [docs/VEHICLE_KIT.md](docs/VEHICLE_KIT.md) |
| `render/` (Rest) | Haupt-Thread | three.js | Szene, Kamera-Rig, Sonne mit Schatten | – |
| `app/` | Haupt-Thread | alles | Verdrahtung dieses Testprojekts: Worker-Client, Eingabe, HUD, Debug | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

## Übernahme in ein anderes Projekt
| Ziel | Anleitung |
|---|---|
| Terrain-Technik (unendlich, LOD, Physik-Kacheln, Floating Origin) | [docs/INTEGRATION_TERRAIN.md](docs/INTEGRATION_TERRAIN.md) |
| Terrain in **apokalypto** (Stand, Datei-Zuordnung, nächste Schritte) | [docs/INTEGRATION_APOKALYPTO.md](docs/INTEGRATION_APOKALYPTO.md) |
| Fahrzeug statt Raycast-Vehicle, Anbindung an einen Asset-Editor | [docs/INTEGRATION_VEHICLE.md](docs/INTEGRATION_VEHICLE.md) |

Öffentliche Einstiege (nur diese importieren):
`shared/terrain/index.ts` · `physics/vehicle/index.ts` · `render/vehicle/index.ts` · `render/terrain/index.ts`

## Stand
| Doku | Inhalt |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Schichten, Threads, Frame-Ablauf, Snapshots, Debug-Tasten, frühere Fehlerursachen |
| [docs/TERRAIN.md](docs/TERRAIN.md) | Raster, Generator, Schichten, LOD, Geomorphing, Zahlen |
| [docs/VEHICLE_KIT.md](docs/VEHICLE_KIT.md) | Konzept, Benennung, Bauteile, Joints, Rapier-Regeln |
| [docs/VEHICLE_PLAN.md](docs/VEHICLE_PLAN.md) | Entscheidungen, umgesetzte und offene Phasen |

Versionen, auf die alles abgestimmt ist: `three@0.187` (WebGPURenderer, TSL), `@dimforge/rapier3d-simd-compat@0.21`,
Vite 8 (Worker per `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`). Tests: Vitest (`tests/`, außerhalb von src).
