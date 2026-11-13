# Vehicle Kit – Stand und Phasen

Konzept, Benennung, Bauteile: [VEHICLE_KIT.md](VEHICLE_KIT.md). Code-Struktur: [ARCHITECTURE.md](ARCHITECTURE.md).

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Joints | Impulse-Joints; Multibody später per `jointMode`, falls lange Ketten (Sattelzug) zittern |
| Rad-Collider | `ball` (kein Kantenhaken am Heightfield); `roundCylinder` als Option `wheel.shape` |
| Antrieb | kein Getriebe: Gas → Ziel-Raddrehzahl `ω = vMax / r`, Moment über `setMotorMaxForce`, Schlupfbegrenzung |
| Takt | 120 Hz fest im Physik-Worker, `numSolverIterations = 8`, McPherson +16 nur für seine Körper |
| Collision-Groups | Terrain `0x1`, Chassis `0x2`, Rad `0x4`; Räder ↔ eigenes Chassis kollidieren nicht |
| Hilfskörper | Strut/Knuckle/Lenker ohne Collider, Masse + Trägheit explizit |
| Optik | nur Boxen/Zylinder, einfarbig; Physik liefert ein Daten-Layout, die Optik baut daraus die Meshes |

## Phasen

| Phase | Inhalt | Stand |
|---|---|---|
| 0 Basis | fester Takt, Eingabe, Collision-Groups, IDs, Auslegungsformeln, Kamera-Follow | ✓ |
| 1 PKW | Chassis, Ball-Räder, Strut, Feder/Dämpfer, Ackermann-Lenkung, Antrieb, Bremse/Handbremse, HUD | ✓ (`tests/vehicle.test.ts`) |
| 1b Aufhängungen | 10 Prinzipien, Taste 1–0, gleiche Radfederrate über Übersetzung | ✓ (`tests/suspensions.test.ts`) |
| — Infrastruktur | Physik-Worker, unendliches LOD-Terrain (32 km), Floating Origin, Rahmen-Collider | ✓ |
| 2 Feinschliff | `antiRollBar`, Teststrecke (Rampe, Wellen, Stufe), Rapier-`debugRender`, `roundCylinder`-Option | offen |
| 3 Mehrachser | Presets `truck6x4`, `truck6x6aws` (Allrad-/Hundegang-Lenkung), `truck8x4` | offen (Starrachse + Tandem-Pendel vorhanden) |
| 4 Motorrad | Telegabel mit Nachlauf, Schwinge, `balanceAssist` (Rollwinkel → Lenkwinkel) | offen |
| 5 Anhänger | `coupling.ts` (hitch / fifthWheel / kingPin), Deichselanhänger, Sattelzug, Taste `T`; einfache Motorkurve | offen |
| 6 Optional | Getriebe, Differential (open / locked / limited slip) – heute wirkt jedes Rad wie gesperrt | offen |
| 7 Kette | Laufrollen an Schwingen (Drehstab = Positions-Motor), Antrieb links/rechts getrennt | offen |
| — Fern-Physik | gröbere Heightfield-Ringe für ferne Objekte (eigene Collision-Group), aus `sampleGrid` | vorbereitet |

## Startwerte PKW (Preset `car`)
- Chassis 1,8 × 0,5 × 4,2 m (Masse/Trägheit), Kollision = Leiterrahmen; 1200 kg, Schwerpunkt −0,2 m
- Räder r = 0,33 m, 20 kg, Reibung 1,1
- Achsen z = −1,35 / +1,35, Spur 1,55, Federweg [−0,10, +0,12]
- Feder 1,6 Hz vorn / 1,8 Hz hinten, ζ = 0,4
- Lenkung max 0,6 rad, Rate 2,5 rad/s, Rückstellung 4 rad/s
- Antrieb RWD, 2400 N·m gesamt, vMax 45 m/s, rückwärts 8 m/s
- Bremse 1500 N·m/Rad vorn, 1000 hinten; Handbremse 3000 N·m/Rad hinten

## Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| Joint-Kette weich/zitternd | Hilfskörper-Massen anheben, Iterationen nur für die Kette, Multibody |
| Ball-Rad rollt seitlich zu leicht | Reibung hoch; `roundCylinder` |
| Motorrad-Balance | Stützräder-Flag zum Debuggen |
| Viele Körper (Sattelzug ~40) | unkritisch: Physik im Worker, ~0,25 ms/Schritt heute |
