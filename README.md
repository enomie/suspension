# suspension

Joint-basierter Fahrzeug-Baukasten (Rapier SIMD) auf unendlichem LOD-Terrain (WebGPU, three.js).
Zehn Aufhängungsprinzipien zum Durchschalten, Physik im Worker mit 120 Hz, Sichtweite 32 km.

```bash
npm install
```

```bash
npm run dev
```

Dev-Server auf Port 9897. Tests (Rapier headless):

```bash
npm test
```

## Steuerung
| Taste | Funktion |
|---|---|
| W / S | Gas / Bremse (im Stand rückwärts) |
| A / D | Lenken |
| Space | Handbremse (hinten) |
| R | Reset an aktueller Position |
| 1 … 0 | Aufhängung: Schiebe-Federbein, Doppelquerlenker, McPherson, Längslenker, Schräglenker, Pendelachse, Starrachse, Verbundlenker, Mehrlenker, Tandem-Pendel |
| Maus | Kamera kreisen / zoomen |
| F1 … F7 | Debug-Schalter (Schatten, Morph, Interpolation, LOD einfrieren, Drahtgitter, Sonne, Schattenfilter) |

URL-Parameter: `?x=…&z=…` Startposition, `?worker=0` Physik im Haupt-Thread, `?dpr=1` geringere Auflösung,
`?debug=shadows,morph,interp` Schalter vorab aus.

## Doku
| Datei | Inhalt |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Schichten (`shared` / `physics` / `render` / `app`), Threads, Frame-Ablauf, Debug |
| [docs/TERRAIN.md](docs/TERRAIN.md) | Zweierpotenz-Raster, LOD-Quadtree, Geomorphing, BatchedMesh, Physik-Kacheln |
| [docs/VEHICLE_KIT.md](docs/VEHICLE_KIT.md) | Konzept, Benennung, Bauteile, Joints, Rapier-Regeln |
| [docs/VEHICLE_PLAN.md](docs/VEHICLE_PLAN.md) | Entscheidungen, Stand, nächste Phasen |
