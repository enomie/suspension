# suspension

Joint-basierter Fahrzeug-Baukasten (Rapier SIMD) auf unendlichem, deterministischem LOD-Terrain (WebGPU, three.js):
Kontinente und Meeresboden bis −1500 m, Gebirgszüge bis 3000 m.
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

URL-Parameter: `?x=…&z=…` Startposition (Gebirge: `?x=858000&z=897000`), `?terrain=world|hills`, `?seed=…`, `?worker=0` Physik im Haupt-Thread, `?dpr=1` geringere Auflösung,
`?debug=shadows,morph,interp` Schalter vorab aus.

## Doku
Die Doku liegt **in `src/`**, damit sie beim Kopieren mitwandert: [src/README.md](src/README.md) ist der Wegweiser.

| Datei | Inhalt |
|---|---|
| [src/docs/INTEGRATION_TERRAIN.md](src/docs/INTEGRATION_TERRAIN.md) | Terrain-Technik in ein anderes Projekt übernehmen |
| [src/docs/INTEGRATION_APOKALYPTO.md](src/docs/INTEGRATION_APOKALYPTO.md) | Umsetzung im Projekt apokalypto: Stand, Zuordnung, nächste Schritte |
| [src/docs/INTEGRATION_VEHICLE.md](src/docs/INTEGRATION_VEHICLE.md) | Fahrzeug statt Raycast-Vehicle, Asset-Editor-Anbindung |
| [src/docs/ARCHITECTURE.md](src/docs/ARCHITECTURE.md) | Schichten, Threads, Frame-Ablauf, Debug |
| [src/docs/TERRAIN.md](src/docs/TERRAIN.md) | Raster, Generator, LOD, Geomorphing |
| [src/docs/VEHICLE_KIT.md](src/docs/VEHICLE_KIT.md) | Konzept, Bauteile, Joints, Rapier-Regeln |
| [src/docs/VEHICLE_PLAN.md](src/docs/VEHICLE_PLAN.md) | Entscheidungen, Stand |
