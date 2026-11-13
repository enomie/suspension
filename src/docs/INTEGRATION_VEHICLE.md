# Fahrzeug-Baukasten in ein anderes Projekt übernehmen

Ziel: einen **Raycast-Vehicle-Controller** durch echte Physik ersetzen. Räder sind Rigid Bodies mit Collidern,
Aufhängungen echte Joint-Ketten, Federn und Dämpfer laufen im Rapier-Solver. Dazu kommt die Anbindung an einen
**Asset-Editor**, der Fahrzeuge aus Primitives baut.

## 1. Raycast-Vehicle vs. dieser Baukasten
| | Raycast-Vehicle | Baukasten hier |
|---|---|---|
| Rad | Strahl + gedachter Zylinder | Rigid Body mit Collider (Kugel oder Rund-Zylinder), echte Reibung |
| Feder/Dämpfer | eigene Kraft-Rechnung pro Frame | Joint-Motor (`ForceBased`) oder Spring-Joint, implizit im Solver → stabil auch bei harten Federn |
| Aufhängung | nur „senkrecht federn“ | 10 Prinzipien mit echter Kinematik (Sturz, Spur, Verschränkung, Wippen) |
| Kanten/Stufen | Strahl „springt“ | Rad rollt über die Kante |
| Kosten | sehr gering | 15–40 Körper je Fahrzeug, ~0,2 ms pro Schritt (Rapier SIMD) |

## 2. Minimal-Einbindung (ohne Worker)
Getestet in `tests/integration.test.ts`:
```ts
import { Vehicle, PRESETS, describeLayout, poseBodies, writeVehicleSnapshot } from './physics/vehicle';
import { VehicleVisual } from './render/vehicle';

world.timestep = 1 / 120;          // abgestimmt auf 120 Hz
world.numSolverIterations = 8;
const spec = PRESETS[0];
const vehicle = new Vehicle(R, world, spec, { x, y: groundY + 1.2, z });
const bodies = poseBodies(vehicle.built);
const visual = new VehicleVisual(describeLayout(spec, vehicle.built));
scene.add(visual.root);

// je Physik-Schritt (fester Takt!):
vehicle.applyInput({ throttle, brake, steer, handbrake }, 1 / 120);
world.step();
vehicle.updateTelemetry();          // optional (HUD)

// je Frame:
visual.apply(writeVehicleSnapshot(vehicle, bodies, { origin: ORIGIN }));
```
Wechsel/Reset: `vehicle.dispose()` (entfernt alle Körper), `visual.dispose()`, neu bauen.
Mit Worker (wie hier): `physics/worker.ts` + `app/PhysicsClient.ts` übernehmen. Dort sind Interpolation nach Zeit,
Generationen gegen „alte Frames“ und das Layout per Nachricht schon gelöst, siehe [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Konventionen
| Thema | Wert |
|---|---|
| Achsen | **vorwärts = −Z**, oben = +Y, rechts = +X; links = Seite `L` (−X) |
| Einheiten | SI: m, kg, N, N·m, rad, s |
| Takt | 120 Hz fest, 8 Solver-Iterationen (McPherson setzt +16 nur für seine Körper). Bei 60 Hz Federn weicher stellen und testen. |
| Collision-Groups | Bits `0x1` Terrain, `0x2` Chassis, `0x4` Rad (`physics/vehicle/groups.ts`). Bei Kollision mit eigenen Gruppen anpassen. |
| Boden | Reibung ~0,95; Räder 1,1 |
| Input | `throttle` 0…1, `brake` 0…1 (im Stand = rückwärts), `steer` −1 (rechts) … +1 (links), `handbrake` bool |
| IDs | `<fahrzeug>.a<achse><seite>.<teil>`, z. B. `car.a0L.wheel` (`ids.ts`) |

## 4. Asset-Editor anbinden
Der Editor baut Fahrzeuge aus Primitives. Hier werden Fahrzeuge aus einer **`VehicleSpec`** gebaut
(`shared/vehicleSpec.ts`, reine Daten). Die Brücke ist also eine Funktion `editorAsset → VehicleSpec`.

### 4.1 Was der Editor liefern muss → wohin es gehört
| Im Editor | in `VehicleSpec` | Bemerkung |
|---|---|---|
| Karosserie-/Rahmen-Primitives (Kollision) | `chassis.colliders: ColliderPrimitive[]` | box / sphere / capsule / cylinder, Position + Rotation chassis-lokal, `rounded` für Kantenrundung. **So nah wie möglich an der sichtbaren Form**, sonst „unsichtbare Wand“. |
| Gesamtmasse, Schwerpunkt | `chassis.mass`, `chassis.comOffset` | Masse kommt aus der Spec, **nicht** aus dem Volumen der Primitives (Collider haben Dichte 0) |
| Abmessungen (Trägheit) | `chassis.size` | Box-Näherung für die Trägheit |
| Rad-Position (Mitte) | Achse: `z` (längs), `y` (Höhe), `track` (Spurweite) | Räder einer Achse **symmetrisch** links/rechts; `track: 0` = ein Rad mittig (Motorrad) |
| Rad-Maße | `axles[i].wheel`: `radius`, `width`, `mass`, `friction`, `shape` | `ball` = robust auf Terrain, `roundCylinder` = realistischer |
| Aufhängungstyp je Achse | `axles[i].suspension` | einer von 10, siehe 4.2 |
| Federung | `axles[i].spring`: `frequencyHz`, `dampingRatio`, `travel: [ein, aus]` | Frequenz statt Federrate. Die Rate wird aus der Achslast berechnet → jedes Gewicht steht richtig. Alternativ `stiffness`/`damping` direkt. |
| Lenkung | `axles[i].steer.maxAngle`, global `steering` | Ackermann je Achse automatisch; Hinterachsen lenken gegenläufig, `crab` = gleichsinnig |
| Antrieb | `axles[i].drive.share`, global `drive` (`maxTorque`, `maxSpeed`, `reverseSpeed`, `rollingResistance`) | Momentverteilung über `share` |
| Bremsen | `axles[i].brake.torque`, `handbrake.torque` | Handbremse nur auf Achsen mit `handbrake` |
| Tandem | `bogieSpacing` | nur `bogie` |
| Sichtbare Meshes | **nicht** in der Spec | Editor-Meshes an die Körper hängen, siehe 4.3 |

Ausgangspunkt für eigene Fahrzeuge: `makeCar(name, label, type)` aus `presets/car.ts` liefert eine vollständige Spec,
der Editor überschreibt einzelne Werte. Getestet in `tests/integration.test.ts`.

### 4.2 Aufhängungen: was der Editor einstellen kann und was fest ist
Die Anlenkpunkte (Lenker-Längen, Dom-Position usw.) erzeugen die Builder **selbst** aus Achse (`z`, `y`, `track`),
Rad und Federweg. Der Editor wählt Typ und Parameter, **nicht** die einzelnen Gelenkpunkte.

| Typ | lenkbar | im Builder fest verdrahtet |
|---|---|---|
| `strut` Schiebe-Federbein | ja | senkrechte Führung |
| `doubleWishbone` Doppelquerlenker | ja | Lenkerlängen/-höhen relativ zur Spur |
| `macPherson` | ja | Dom-Position, Querlenker; Übersetzung per Statik |
| `trailingArm` / `semiTrailingArm` | nein | Armlänge 0,55 m, Pfeilung 20° |
| `swingAxle` Pendelachse | ja | Drehpunkt Fahrzeugmitte |
| `solidAxle` Starrachse | ja | Achskörper über beide Räder |
| `twistBeam` Verbundlenker | nein | Armlänge 0,55 m, Torsionssteifigkeit 0,6 × Radrate |
| `multiLink` Mehrlenker | ja | 5 Stab-Punkte (Tabelle in `multiLink.ts`) |
| `bogie` Tandem-Pendel | nein | Wippe, Radabstand `bogieSpacing` |

**Wenn der Editor eigene Gelenkpunkte („Hardpoints“) setzen soll:** Erweiterungspunkt ist `AxleSpec` um ein optionales
`hardpoints`-Objekt je Typ, das der jeweilige Builder statt seiner festen Werte nutzt
(`physics/vehicle/parts/suspension/<typ>.ts`). Die Federrate muss dann weiter über `leverRatio`/`springFor`
auf die Radmitte umgerechnet werden, sonst stehen die Prinzipien unterschiedlich hoch.

### 4.3 Optik aus dem Editor statt der Standard-Optik
`VehicleVisual` zeichnet einen Leiterrahmen, Räder, Lenker, Federn und Dämpfer. Für Editor-Modelle:
- **Karosserie**: Editor-Mesh als Kind von `visual.chassis` (Group, folgt dem Chassis-Körper), Rahmen ausblenden.
- **Räder**: je Corner `layout.corners[i].wheel` = Körper-Index → Pose über `visual.position(index, v)` / `visual.rotation(index, q)`.
  Rad-Mesh dreht um die lokale X-Achse.
- **Lenker/Federn**: `layout.links` enthält je Teil zwei Körperpunkte (`a`, `b` mit Körper-Index + lokalem Punkt).
  Damit lassen sich eigene Meshes strecken (Muster: `stretch()` in `render/vehicle/linkVisual.ts`).
- Wichtig: Posen kommen **immer** aus dem Snapshot, auch ohne Worker, damit Optik und Physik dieselbe Quelle haben.

### 4.4 Checkliste für die Editor-Brücke
1. Koordinaten: vorwärts = −Z? Sonst beim Export drehen.
2. Räder einer Achse auf gleicher `z`/`y`, symmetrisch? Sonst Achse aufteilen oder Builder erweitern.
3. Collider-Primitives deckungsgleich mit der sichtbaren Form, unten **abgerundet** (`rounded` ≥ 0,03 m).
4. Bodenfreiheit: Chassis-Collider-Unterkante ≥ Rad-Unterkante + Einfederweg + Reserve.
5. Masse/Schwerpunkt aus dem Editor, nicht aus den Primitives.
6. Federn als Frequenz (1,2–2 Hz PKW, 2–3 Hz Sport), Dämpfung ζ 0,3–0,5.
7. Test anlegen: Fahrzeug steht ruhig auf Konstruktionshöhe, fährt, lenkt, bleibt aufrecht
   (Vorlage: `tests/suspensions.test.ts`, `tests/invisibleWall.test.ts`).

## 5. Wichtige Regeln (Rapier)
- Fester Takt, sonst ändert sich das Federverhalten mit der Bildrate.
- Hilfskörper (Strut, Knuckle, Lenker) haben **keinen Collider**, aber explizite Masse/Trägheit, nicht zu leicht
  gegenüber dem Chassis (≤ 1:30), sonst zittert die Kette.
- Räder mit CCD. Antriebsmoment immer begrenzen (`setMotorMaxForce`), sonst ist der Motor „unendlich stark“.
- Joint-Kontakte zwischen verbundenen Körpern sind aus, Räder kollidieren nicht mit dem eigenen Chassis.
- Details: [VEHICLE_KIT.md](VEHICLE_KIT.md) §9.
