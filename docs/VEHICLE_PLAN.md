# Vehicle Kit – Umsetzungsplan (Schritt 2 von 3)

> **Stand 2026-11-13:** Phase 0 + 1 umgesetzt (PKW fährt, `tests/vehicle.test.ts` grün).
> Abweichungen vom Plan: Bremse/Handbremse liegen in `parts/drive.ts` (kein eigenes `brake.ts`);
> Hilfskörper-Builder heißt `parts/knuckle.ts → createHelperBody()`; gemeinsamer Bau-Kontext in `parts/context.ts`.
> **Update:** Alle 10 Aufhängungen umgesetzt (Taste 1–0, `tests/suspensions.test.ts`). Builder arbeiten pro Achse
> (`AxleBuilder`), gemeinsame Helfer in `parts/suspension/common.ts`, Optik generisch über `LinkVisual` (`visual/linkVisual.ts`),
> Rahmen = 1 Mesh. McPherson: Übersetzung per Statik (`strutRatio`), geschlossene Kette bekommt +16 Solver-Iterationen nur für ihre Körper
> (`setAdditionalSolverIterations`) – vorher 25 mm zu tief wegen Konvergenz. Mehrlenker: Einfeder-Anschlag = Seil zu Punkt 2 m darunter.
> Differential (open/locked) noch nicht – jedes Rad hat eigenen Velocity-Motor (wirkt wie gesperrt).

Basis: [VEHICLE_KIT.md](VEHICLE_KIT.md). Hier: Entscheidungen, Dateistruktur, Datentypen, Phasen mit Abnahmekriterien.

## 1. Entscheidungen (Antworten auf die offenen Fragen)

| # | Frage | Entscheidung | Begründung |
|---|---|---|---|
| 1 | Impulse- oder Multibody-Joints | **Impulse-Joints** als Standard, Builder abstrahiert `createJoint()` → Multibody später per Flag `jointMode: 'impulse' \| 'multibody'` | Impulse-Joints unterstützen Motoren/Limits/`setContactsEnabled` überall gleich; Multibody erst testen, wenn Sattelzug zittert |
| 2 | Rad-Collider | **`ball`** in Phase 1, `roundCylinder` als Option `wheel.shape` ab Phase 3 | Kugel = kein Kantenhaken am Heightfield, sofort stabil |
| 3 | Getriebe | **Kein Getriebe** am Anfang: Gas → Ziel-Raddrehzahl `ω = vMax / r`, Moment begrenzt per `setMotorMaxForce`. `Engine`/`Gearbox` erst Phase 5 | einfach + sofort fahrbar |
| 4 | Terrain | 100×100 m bleibt; **zusätzlich Testelemente** (Rampe, Bodenwellen, Stufe) als feste Cuboids in `src/testTrack.ts` | Federung sichtbar prüfbar |
| 5 | Visuals | nur Boxen/Zylinder, einfarbig, keine Texturen/Verläufe, instanced wo möglich, ≤ 100 Draw Calls | Stilregeln |

Weitere Festlegungen:
- **Fester Timestep 1/120 s** mit Akkumulator, max. 4 Substeps/Frame; Render interpoliert nicht (Phase 1), optional später.
- `world.numSolverIterations = 8`.
- **Collision-Groups**: `GROUP_TERRAIN = 0x0001`, `GROUP_CHASSIS = 0x0002`, `GROUP_WHEEL = 0x0004`. Räder kollidieren nur mit Terrain/Fremdkörpern, nicht mit eigenem Chassis (zusätzlich `setContactsEnabled(false)` je Joint).
- Hilfskörper (Strut, Knuckle) **ohne Collider**, Masse über `setAdditionalMassProperties` (≈ 5–10 % Radmasse, Trägheit ≈ Rad).
- Alle Motoren `MotorModel.ForceBased`.

## 2. Dateistruktur

```
src/
  main.ts                       – Setup, fester Physik-Loop, Fahrzeug spawnen, Kamera folgt
  input/keyboard.ts             – Tastenzustand → DriverInput {throttle, brake, steer, handbrake}
  testTrack.ts                  – Rampe, Wellen, Stufe (Collider + Mesh)
  vehicle/
    types.ts                    – alle Spec- und Runtime-Typen (siehe §3)
    ids.ts                      – Namensschema `<vehicle>.<axle><side>.<part>`
    groups.ts                   – Collision-Groups
    tuning.ts                   – Formeln: springRate(m,f), damping(k,m,ζ), preload()
    buildVehicle.ts             – VehicleSpec → Vehicle (Bodies, Joints, Meshes)
    Vehicle.ts                  – Runtime: applyInput(dt), syncMeshes(), telemetry, dispose()
    parts/
      chassis.ts
      wheel.ts
      knuckle.ts
      suspension/
        index.ts                – Dispatcher nach SuspensionType
        strut.ts                – Phase 1
        swingArm.ts             – Phase 3
        telescopicFork.ts       – Phase 4
        doubleWishbone.ts       – Phase 6
        solidAxle.ts            – Phase 3
        bogie.ts                – Phase 3
      springDamper.ts           – Motor-Feder & Spring-Joint-Helfer
      antiRollBar.ts            – Phase 2
      steering.ts               – ackermann / allWheel / crab
      drive.ts                  – Raddrehzahl-Ziel, Momentverteilung, Differential
      brake.ts                  – Betriebs- + Handbremse
      coupling.ts               – hitch / fifthWheel / kingPin (Phase 5)
      balanceAssist.ts          – Motorrad (Phase 4)
      track.ts                  – Kettenfahrzeug (Phase 7)
    presets/
      index.ts                  – Liste, Taste 1…9
      car.ts, truck6x4.ts, truck6x6aws.ts, truck8x4.ts,
      motorcycle.ts, drawbarTrailer.ts, semiTractor.ts, semiTrailer.ts, tank.ts
  debug/
    telemetry.ts                – HUD: pro Corner Federweg, Kraft, Radspeed, Kontakt
    physicsDebug.ts             – Rapier debugRender() als LineSegments (Taste F1)
tests/
  vehicle.static.test.ts        – steht ruhig, Einfederung ≈ Soll
  vehicle.limits.test.ts        – Federweg-Limits
  vehicle.brake.test.ts         – Handbremse nur hinten
  vehicle.steer.test.ts         – Lenkwinkel/Ackermann
  coupling.test.ts              – Kupplung hält
```

## 3. Datentypen (Kern)

```ts
type Side = 'L' | 'R' | 'C';
type SuspensionType = 'strut' | 'swingArm' | 'telescopicFork' | 'doubleWishbone' | 'solidAxle' | 'bogie';

interface SpringDamperSpec {
  frequencyHz?: number;      // alternativ zu stiffness → tuning.ts rechnet k
  dampingRatio?: number;     // ζ, alternativ zu damping
  stiffness?: number;        // N/m
  damping?: number;          // N·s/m
  travel: [min: number, max: number]; // m, relativ zur Ruhelage (−ein, +aus)
  staticSag?: number;        // Anteil Federweg bei Stillstand (0.35)
}

interface WheelSpec { radius: number; width: number; mass: number; friction: number; shape?: 'ball' | 'roundCylinder'; }

interface AxleSpec {
  z: number;                 // Längsposition rel. Chassis (−Z = vorn)
  track: number;             // Spurweite (0 bei Motorrad → Side 'C')
  y: number;                 // Anlenkhöhe
  suspension: SuspensionType;
  spring: SpringDamperSpec;
  wheel: WheelSpec;
  steer?: { factor: number; maxAngle: number };   // factor: +1 normal, −x gegenläufig
  drive?: { share: number };                       // Anteil am Antriebsmoment
  brake: { torque: number };
  handbrake?: { torque: number };
  antiRollBar?: { stiffness: number };
}

interface VehicleSpec {
  name: string;
  chassis: { size: [number, number, number]; mass: number; comOffset?: [number, number, number] };
  axles: AxleSpec[];         // Index 0 = vorderste
  steering: { mode: 'ackermann' | 'allWheel' | 'crab'; rate: number; returnRate: number };
  drive: { maxTorque: number; maxSpeed: number; reverseSpeed: number; differential: 'open' | 'locked' };
  couplings?: { type: 'hitch' | 'fifthWheel' | 'kingPin'; at: [number, number, number] }[];
  jointMode?: 'impulse' | 'multibody';
}

interface DriverInput { throttle: number; brake: number; steer: number; handbrake: boolean; }
```

Runtime `Corner`: `{ id, axleIndex, side, bodies: {strut?, knuckle?, wheel}, joints: {suspension, steer?, spin}, mesh }`
+ Telemetrie `compression, springForce, wheelOmega, inContact`.

## 4. Ablauf pro Physik-Step (`Vehicle.applyInput`)

1. `steering.update(input.steer, dt)` → Lenkwinkel glätten, pro Achse `angle·factor`, Ackermann: inneres Rad `atan(L / (R − t/2))`, äußeres `atan(L / (R + t/2))`.
2. `drive.update(input)`:
   - `W`: Ziel `ω = maxSpeed / r`, MaxForce = `maxTorque·share / nDriveWheels`.
   - `S`: fährt vorwärts (v > 0,5 m/s) ⇒ Bremse; sonst Rückwärts-Ziel.
   - kein Gas: Velocity-Motor mit Ziel 0 und kleinem Rollwiderstands-Moment.
3. `brake.update`: Bremse überschreibt Motor (Ziel 0, MaxForce = Bremsmoment). `Space` ⇒ nur Achsen mit `handbrake` (Hinterachsen).
4. `antiRollBar.apply()` (ab Phase 2).
5. `world.step()` danach `syncMeshes()` + Telemetrie.

## 5. Phasen (Umsetzung = Schritt 3)

| Phase | Inhalt | Abnahme |
|---|---|---|
| **0 Basis** | fester Timestep, `keyboard.ts`, `groups.ts`, `ids.ts`, `tuning.ts`, Test-Kugeln raus, Kamera-Follow (Orbit um Fahrzeug) | 120 Hz Physik stabil, Tests grün |
| **1 PKW** | `chassis`, `wheel` (ball), `knuckle`, `strut`, `springDamper`, `steering` (ackermann), `drive`, `brake`, Preset `car`, Debug-HUD | steht ruhig mit Sag ≈ 35 %, WASD fährt, Space blockiert nur hinten, kein Zittern bei 30 m/s; Tests static/limits/brake/steer |
| **2 Feinschliff** | `antiRollBar`, `testTrack.ts`, `physicsDebug` (F1), `roundCylinder`-Option, Reset `R` | über Wellen sichtbares Federn, Rollen reduziert |
| **3 Mehrachser** | `solidAxle`, `bogie`, `swingArm`; Presets `truck6x4`, `truck6x6aws` (allWheel/crab umschaltbar), `truck8x4` | alle Achsen tragen gleichmäßig, Allradlenkung engerer Wendekreis |
| **4 Motorrad** | `telescopicFork` (Nachlauf), `swingArm` hinten, `balanceAssist` (PD-Regler Rollwinkel → Lenkwinkel) | fährt geradeaus und Kurven ohne Umfallen ab ~3 m/s |
| **5 Anhänger** | `coupling.ts` (hitch/fifthWheel/kingPin), Presets `drawbarTrailer`, `semiTractor`, `semiTrailer`, an-/abkuppeln `T`; einfache `Engine`-Kurve | Sattelzug fährt Kurven, kein Abreißen/Zittern (sonst `jointMode: multibody`) |
| **6 Optional** | `doubleWishbone`, Getriebe, Limited-Slip | – |
| **7 Kette** | `track.ts`: Laufrollen an `swingArm` (Drehstab = Positions-Motor), Antrieb links/rechts getrennt, Kette visuell | dreht auf der Stelle, überfährt Stufe |

## 6. Startwerte PKW (Preset `car`)

- Chassis 1,8 × 0,5 × 4,2 m, 1200 kg, Schwerpunkt −0,2 m
- Räder r = 0,33 m, 20 kg, Reibung 1,1
- Achsen z = −1,35 / +1,35, Spur 1,55, Federweg [−0,10, +0,12]
- Feder f = 1,6 Hz (vorn) / 1,8 Hz (hinten), ζ = 0,4 → k ≈ 300·(2π·1,6)² ≈ 30 kN/m
- Lenkung max 0,6 rad, Rate 2,5 rad/s, Rückstellung 4 rad/s
- Antrieb RWD, 2400 N·m gesamt am Rad, vMax 45 m/s, rückwärts 8 m/s
- Bremse 1500 N·m/Rad vorn, 1000 hinten; Handbremse 3000 N·m/Rad hinten

## 7. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Joint-Kette Chassis→Strut→Knuckle→Rad weich/zitternd | Massen der Hilfskörper anheben, Iterationen ↑, Multibody-Modus |
| Velocity-Motor bremst ungewollt (kein Freilauf) | bei Gas 0: MaxForce ≈ Rollwiderstand statt 0-Ziel mit großem Moment |
| Ball-Rad „rollt“ seitlich zu leicht | Reibung hoch; später roundCylinder |
| Motorrad-Balance | Stützräder-Flag zum Debuggen |
| Performance bei Sattelzug (≈ 40 Bodies) | unproblematisch für Rapier SIMD; messen per HUD |

## Später: Physik im Worker
Zurückgestellt (2026-11-13): Physik kostet aktuell 0,26–0,92 ms/Frame (gemessen, 20–40 Körper).
Lohnt sich ab mehreren Fahrzeugen / Sattelzug / Kettenfahrzeug. Ansatz: Worker schreibt Posen in SharedArrayBuffer
(Triple-Buffer, braucht COOP/COEP-Header), Main-Thread interpoliert mit dem vorhandenen `PoseInterpolator`.
Zu klären: Input-Latenz (+1 Frame), Floating-Origin-Shift und Fahrzeugbau über die Thread-Grenze.
