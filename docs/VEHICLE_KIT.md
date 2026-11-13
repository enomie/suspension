# Vehicle Kit – Fahrzeug-Baukasten (Rapier SIMD, Joint-basiert)

> Status: **Notizen / Anforderungen** (Schritt 1 von 3). Nächster Schritt: Planung (`docs/VEHICLE_PLAN.md`), danach Umsetzung.

## 1. Ziel

Ein **ganz einfaches, steuerbares Fahrzeug** in Rapier (`@dimforge/rapier3d-simd-compat@0.21`), **ohne Raycast-Vehicle**
(`DynamicRayCastVehicleController` wird bewusst NICHT verwendet). Räder sind echte Rigid Bodies mit Collidern,
verbunden über **Joints**. Federn + Stoßdämpfer sind echte Feder-Dämpfer-Elemente (Joint-Motoren bzw. Spring-Joints).

Daraus soll ein **Baukasten** werden: gleiche Bauteile, sauber benannt, beliebig kombinierbar zu

| Fahrzeug | Achsen | Besonderheit |
|---|---|---|
| Motorrad | 2 (je 1 Rad) | Telegabel mit Nachlauf, Schwinge hinten, Balance/Lenkhilfe |
| PKW 2-Achser | 2 | Ackermann-Lenkung vorn, Antrieb FWD/RWD/AWD |
| 3-Achser (LKW) | 3 | Lenkachse vorn, Tandem hinten |
| 3-Achser Allradlenkung | 3 | alle Achsen lenken (gegenläufig / Hundegang) |
| 4-Achser | 4 | 2 Lenkachsen vorn, Tandem hinten |
| Anhänger (Deichsel) | 1–2 | Deichsel-Gelenk + Drehschemel |
| Sattelzug | Zugmaschine + Auflieger | Sattelkupplung (Königszapfen) |
| Kettenfahrzeug (später) | n Laufrollen | Laufrollen gefedert, Kette als Antriebsmodell |

Bestehender Code (Ausgangslage):
- `src/physics/rapierWorld.ts` – Rapier-Init, Welt mit g = −9,81
- `src/physics/createHeightfieldCollider.ts` – Heightfield 100×100 m (Reibung 0,95)
- `src/terrain/*` – deterministisches Terrain (fbm), Mesh + Collider synchron
- `src/main.ts` – WebGPU-Renderer, OrbitControls, Test-Kugeln, variabler Physik-Timestep (→ wird fix)
- Dev-Server: Port **9897** (`npm run dev`)

## 2. Steuerung

| Taste | Funktion |
|---|---|
| `W` | Gas vorwärts |
| `S` | Bremsen, bei Stillstand rückwärts |
| `A` / `D` | Lenken links / rechts (mit Lenkrate + Rückstellung) |
| `Space` | **Handbremse – nur Hinterachse(n)** (blockiert Räder) |
| später | `R` Reset/Aufrichten, `C` Kamera, `1…9` Fahrzeugwahl, `T` Anhänger an-/abkuppeln |

## 3. Grundprinzip (einfachste Variante = „Strut / Schiebe-Federbein“)

Pro Radposition (Corner) eine Kette aus Körpern und Joints:

```
Chassis ──[Prismatic: Feder+Dämpfer]──► Strut (Federbein-Träger)
Strut   ──[Revolute Y: Lenkung]───────► Knuckle (Achsschenkel)      (nur lenkbare Räder)
Knuckle ──[Revolute X: Raddrehung]────► Wheel  (Rad mit Collider)
```

Nicht lenkbar: Knuckle entfällt bzw. Strut ↔ Wheel direkt per Revolute.

**Feder + Dämpfer = Positions-Motor des Prismatic-Joints:**
`joint.configureMotorPosition(restPos, k, c)` mit `MotorModel.ForceBased` ⇒ Kraft `F = k·(restPos − x) − c·v`.
Das ist exakt Feder (k in N/m) + linearer Dämpfer (c in N·s/m), implizit gelöst ⇒ stabil auch bei harten Federn.
- `setLimits(min, max)` = Ein-/Ausfederweg (Bump-/Rebound-Stop)
- `restPos` verschieben = **Vorspannung / Niveauregulierung**
- Alternative für Mehrlenker: `JointData.spring(restLength, k, c, a1, a2)` als separates Federbein zwischen zwei Körpern

**Lenkung** = Positions-Motor am Revolute-Y (`configureMotorPosition(winkel, kSteer, cSteer)`, Limits = max. Lenkeinschlag).
**Antrieb** = Velocity-Motor am Rad-Revolute (`configureMotorVelocity(ω, factor)` + `setMotorMaxForce(Drehmoment)`).
**Bremse/Handbremse** = Velocity-Motor mit Ziel 0 und begrenztem Max-Moment (= Bremsmoment).

Warum so: Rapier liefert das Feder-Dämpfer-Verhalten direkt im Solver, kein eigenes Kraft-Integrieren nötig,
und andere Aufhängungen sind nur andere Joint-Topologien aus denselben Bauteilen.

## 4. Aufhängungen (umgesetzt, Taste 1–0)

Jede Aufhängung = eine Datei in `src/vehicle/parts/suspension/`, baut eine **ganze Achse** und liefert nur den
**Radträger** (`carrier`) + Lenker/Federn. Lenk-Knuckle und Rad hängt `finishCorner()` (common.ts) immer gleich an.
Federraten werden über die Übersetzung (`leverRatio`, MR) auf die Radmitte umgerechnet → alle Prinzipien gleich hart.

| Taste | `SuspensionType` | Topologie | Feder |
|---|---|---|---|
| 1 | `strut` | Chassis ─Prismatic −Y→ Strut | Prismatic-Motor |
| 2 | `doubleWishbone` | Chassis ─Rev Z→ unt. Lenker ─Rev Z→ Radträger; Chassis ─Rev Z→ ob. Lenker ─Spherical→ Radträger | Spring-Joint am unteren Lenker |
| 3 | `macPherson` | Chassis ─Spherical→ Dom ─Prismatic schräg→ Radträger; Chassis ─Rev Z→ Querlenker ─Rev Z→ Radträger | Prismatic-Motor |
| 4 | `trailingArm` | Chassis ─Rev X (vor dem Rad)→ Lenker | Spring-Joint |
| 5 | `semiTrailingArm` | wie 4, Achse 20° gepfeilt | Spring-Joint |
| 6 | `swingAxle` | Chassis ─Rev Z (Mitte)→ Halbachse | Spring-Joint |
| 7 | `solidAxle` | Chassis ─Prismatic −Y→ Führung ─Rev Z→ Achskörper (beide Räder) | 2 Spring-Joints |
| 8 | `twistBeam` | 2 Längslenker + Rev X zwischen den Lenkern mit Positions-Motor (Torsion) | Spring-Joints |
| 9 | `multiLink` | 5 Stäbe: Chassis ─Spherical→ Stab ─Spherical→ Radträger | Spring-Joint + 2 Ropes (Aus- und Einfeder-Anschlag) |
| 0 | `bogie` | Chassis ─Prismatic −Y→ Träger ─Rev X→ Wippe → 2 Räder | Prismatic-Motor |

Nicht lenkbare Prinzipien (4, 5, 8, 0) sitzen hinten, vorn bleibt `strut` mit Lenkung.
Motorrad-Schwinge = `trailingArm` mit `track: 0`.

Zusätzlich (Bauteil, keine Aufhängung): `antiRollBar` – Stabilisator als eigene Kraft zwischen linker/rechter Federweg-Differenz
(`F = kRoll·(xL − xR)`), per `addForceAtPoint` pro Step.

## 5. Benennung (verbindlich)

Englische Code-Namen, deutsche Doku. Ein Bauteil = eine Datei.

### Hierarchie

```
Vehicle            – Gesamtfahrzeug (Zugmaschine, Anhänger …), Liste von Bodies + Joints, Input-Verarbeitung
 ├─ Chassis        – Hauptkörper (gefederte Masse), Schwerpunkt per Collider-Dichte/Masse
 ├─ Axle[]         – Achse: Index, Position x (längs), Spurweite, Rolle (steer/drive/brake/handbrake)
 │   └─ Corner[]   – Radposition: side = 'L' | 'R' | 'C' (C = Mitte, Motorrad)
 │       ├─ Suspension  – Typ + Federrate, Dämpfung, Weg, Vorspannung
 │       ├─ Knuckle     – Achsschenkel (optional, wenn lenkbar)
 │       └─ Wheel       – Radkörper + Collider, Radius, Breite, Masse, Reibung
 ├─ Steering       – Lenkmodell (ackermann / allWheel / crab / none), Lenkrate, Max-Winkel
 ├─ Drivetrain     – Engine (Drehmomentkurve einfach), Gearbox (optional), Differential pro Achse
 ├─ Brakes         – Betriebsbremse (alle), Handbremse (nur handbrake-Achsen)
 └─ Coupling[]     – Kupplungspunkte: hitch (Deichsel), fifthWheel (Sattel), kingPin (Auflieger)
```

### ID-Schema (Body-/Joint-Namen, für Debug & Lookup)

`<vehicle>.<axleIndex><side>.<part>` – z. B.

- `truck.chassis`
- `truck.a0L.strut`, `truck.a0L.knuckle`, `truck.a0L.wheel`
- `truck.a0L.j.suspension`, `truck.a0L.j.steer`, `truck.a0L.j.spin`
- `truck.c0.fifthWheel` ↔ `trailer.c0.kingPin`, Joint `coupling:truck.c0-trailer.c0`

Achsen werden **von vorn nach hinten** gezählt (`a0` = vorderste). Seiten: `L` links, `R` rechts, `C` Mitte.
Koordinaten: **Vorwärts = −Z**, oben = +Y, rechts = +X (wie Ocean-Projekt). Einheiten SI (m, kg, N, N·m, rad).

## 6. Bauteil-Liste

| Bauteil | Datei (geplant) | Rapier-Objekte | Parameter |
|---|---|---|---|
| `Chassis` | `src/vehicle/parts/chassis.ts` | dynamic RigidBody, cuboid/convexHull Collider | Maße, Masse, Schwerpunkt-Offset, Collision-Group |
| `Wheel` | `parts/wheel.ts` | dynamic RigidBody, `cylinder`/`roundCylinder` (um Z gedreht) oder `ball` | Radius, Breite, Masse, Reibung, CCD an |
| `Knuckle` | `parts/knuckle.ts` | kleiner dynamic Body (kein Collider, Masse manuell) | Masse, Trägheit |
| `Strut` | `parts/strut.ts` | kleiner dynamic Body | Masse |
| `Spring`/`Damper` | `parts/springDamper.ts` | Motor-Config bzw. `JointData.spring` | k [N/m], c [N·s/m], restLength, Vorspannung |
| `BumpStop` | in `springDamper.ts` | `setLimits` | min/max Federweg |
| `AntiRollBar` | `parts/antiRollBar.ts` | Kraft pro Step | kRoll [N/m] |
| `Steering` | `parts/steering.ts` | Revolute-Y Positions-Motor | maxAngle, rate, Ackermann-Faktor, Modus |
| `Engine` | `parts/engine.ts` | – (rechnet Moment) | maxTorque, maxRpm, simple Kurve |
| `Differential` | `parts/differential.ts` | verteilt auf Rad-Motoren | open / locked / limitedSlip |
| `Brake` | `parts/brake.ts` | Velocity-Motor Ziel 0 + MaxForce | Bremsmoment je Achse |
| `Handbrake` | in `brake.ts` | wie Brake, nur Hinterachsen | Moment |
| `Hitch` / `FifthWheel` / `KingPin` | `parts/coupling.ts` | Joint zwischen 2 Vehicles | Typ, Winkel-Limits |
| `Track` (später) | `parts/track.ts` | Laufrollen + Antriebsmodell | Rollenanzahl, Kettenspannung |

## 7. Joint-Liste

| Joint | Rapier | Achse / Freiheitsgrad | Motor | Limits | Zweck |
|---|---|---|---|---|---|
| `j.suspension` | `JointData.prismatic` | lokal Y (bzw. Gabel-Achse) | Position (Feder+Dämpfer), ForceBased | Federweg | Federung |
| `j.steer` | `JointData.revolute` | Y (bzw. Lenkachse mit Nachlauf) | Position (Lenkwinkel) | ±maxAngle | Lenkung |
| `j.spin` | `JointData.revolute` | X (Radachse) | Velocity (Antrieb/Bremse) + MaxForce | – | Raddrehung |
| `j.arm` | `JointData.revolute` | X | – | Schwingwinkel | Schwinge / Längslenker / Querlenker |
| `j.armBall` | `JointData.spherical` | 3 Rot. | – | – | Querlenker ↔ Knuckle |
| `j.coilover` | `JointData.spring` | Abstand | (Spring-Joint) | – | Federbein bei Lenker-Aufhängungen |
| `j.axleRoll` | `JointData.revolute` | Z (längs) | optional Position (Stabi) | Verschränkung | Starrachse |
| `j.bogie` | `JointData.revolute` | X | – | Wippwinkel | Tandem-Pendel |
| `coupling.hitch` | `JointData.spherical` (bzw. `generic`) | 3 Rot. | – | Knickwinkel | Deichsel-Anhänger |
| `coupling.fifthWheel` | `JointData.generic` (Rot. Y frei, Rot. X begrenzt, Rest gesperrt) | Yaw + Nicken | – | Nicken ±X° | Sattelkupplung |

Allgemein: `joint.setContactsEnabled(false)` zwischen verbundenen Körpern, zusätzlich Collision-Groups
(Räder ↔ eigenes Chassis kollidieren nicht).

## 8. Fahrzeug-Rezepte (Zielkonfigurationen)

- **`motorcycle`**: a0C (`telescopicFork`, lenkbar, Nachlauf ~25°), a1C (`swingArm`, Antrieb, Handbremse). Braucht `BalanceAssist`
  (Rollwinkel-Regler → Lenkwinkel, Gegenlenken) – sonst fällt es um. Optional Stützräder für ersten Test.
- **`car`**: a0 L/R `strut` lenkbar (Ackermann), a1 L/R `strut` Antrieb + Handbremse. RWD/FWD/AWD per Differential-Config.
- **`truck6x4`**: a0 lenkbar, a1+a2 Antrieb (+ optional `bogie`), Handbremse a1+a2.
- **`truck6x6AllWheelSteer`**: alle 3 Achsen lenkbar, Lenkfaktor pro Achse (a0 = +1, a1 = 0…−0,3, a2 = −0,6) ⇒ gegenläufig;
  Modus `crab` = alle gleichsinnig.
- **`truck8x4`**: a0+a1 lenkbar (a1 mit kleinerem Winkel, Ackermann über Längsabstand), a2+a3 Antrieb.
- **`drawbarTrailer`**: a0 an Drehschemel (Revolute Y) + Deichsel (`hitch`), a1 starr.
- **`semiTractor` + `semiTrailer`**: Zugmaschine 4x2/6x4 mit `fifthWheel`, Auflieger mit `kingPin` + 2–3 Achsen hinten.
- **`tank` (später)**: 5–7 Laufrollen/Seite an `swingArm` (Drehstab = Revolute-Positions-Motor), Antrieb per Seite
  (Differenzial-Lenkung: links/rechts unterschiedliche Geschwindigkeit). Kette zunächst nur visuell + Rollen angetrieben;
  echte Kettenglieder (Kette aus Boxen + Revolute) ggf. später als Experiment.

## 9. Physik-Regeln / Fallstricke (Rapier)

- **Fester Timestep**: 1/120 s (ggf. Substeps), Akkumulator in `main.ts` statt variablem `dt`.
- **Massenverhältnisse**: Rad/Knuckle/Strut nicht zu leicht gegenüber Chassis (Ziel ≤ 1:30), sonst federt/zittert die Joint-Kette.
  Kleine Hilfskörper (Strut, Knuckle) bekommen explizite Masse + Trägheit (`setAdditionalMassProperties`).
- **Solver**: `world.numSolverIterations` = 8; geschlossene Ketten (McPherson) zusätzlich `setAdditionalSolverIterations` nur auf ihren Körpern, ggf. Joint-Kette als **Multibody** statt Impulse-Joint testen
  (stabiler bei langen Ketten, z. B. Sattelzug).
- **CCD** an Rädern (`setCcdEnabled(true)`) für hohe Geschwindigkeit.
- **Federrate auslegen**: Eigenfrequenz f ≈ 1–2 Hz (PKW) ⇒ `k = m_corner·(2πf)²`; Dämpfung `c = 2·ζ·√(k·m_corner)`, ζ ≈ 0,3–0,5.
  Vorspannung so, dass Statik-Einfederung ≈ 30–40 % des Federwegs.
- **Reifenreibung**: Rapier-Kontaktreibung (Coulomb) – kein Pacejka. Reibung Rad ~1,0–1,2, Heightfield 0,95. Rad-Collider
  `roundCylinder` statt `cylinder` für sanfte Kanten; `ball` als einfachster Start.
- Lenk- und Feder-Motoren immer `MotorModel.ForceBased`, damit k/c physikalische Einheiten haben.
- Antriebsmoment begrenzen über `setMotorMaxForce` – ohne Limit ist der Velocity-Motor „unendlich stark“.

## 10. Docs / Tests (zu erstellen)

- `docs/VEHICLE_KIT.md` – diese Datei (Konzept, Namen, Bauteile, Joints)
- `docs/VEHICLE_PLAN.md` – Umsetzungsplan (nächster Schritt)
- `docs/parts/*.md` oder JSDoc direkt in jeder Bauteil-Datei
- Tests (vitest, headless Rapier): Fahrzeug steht ruhig (Einfederung ≈ Soll), Federweg-Limits greifen, Handbremse blockiert
  nur Hinterachse, Lenkwinkel erreicht Soll, Kupplung hält bei Zug.
- Debug-Overlay: Federweg/Kraft pro Corner, Radgeschwindigkeit, Rapier `debugRender()` umschaltbar.

## 11. Offene Fragen (für die Planung)

1. Impulse-Joints oder Multibody-Joints als Standard?
2. Rad-Collider: `ball` (einfach, robust) vs. `roundCylinder` (realistischer)?
3. Getriebe gleich mit rein oder erst nur „Gas = Ziel-Raddrehzahl“?
4. Terrain bleibt 100×100 m oder größer / Teststrecke mit Rampen, Bodenwellen?
5. Visuals: nur einfache Boxen/Zylinder (Stilregel: keine Texturen, keine Verläufe, ≤ 100 Draw Calls)?
