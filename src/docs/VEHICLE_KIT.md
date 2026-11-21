# Vehicle Kit – vehicle building blocks (Rapier SIMD, joint-based)

> Concept, naming, and parts of the vehicle kit. Implementation status and next phases: [VEHICLE_PLAN.md](VEHICLE_PLAN.md).

## 1. Goal

A **very simple, controllable vehicle** in Rapier (`@dimforge/rapier3d-simd-compat@0.21`), **without raycast vehicle**
(`DynamicRayCastVehicleController` is deliberately NOT used). Wheels are real rigid bodies with colliders,
connected via **joints**. Springs + dampers are real spring-damper elements (joint motors or spring joints).

This becomes a **kit**: same parts, clean naming, freely combinable into

| Vehicle | Axles | Notes |
|---|---|---|
| Motorcycle | 2 (1 wheel each) | telescopic fork with trail, rear swingarm, balance/steer assist |
| Car 2-axle | 2 | Ackermann front, FWD/RWD/AWD |
| 3-axle (truck) | 3 | steer axle front, tandem rear |
| 3-axle all-wheel steer | 3 | all axles steer (opposite / crab) |
| 4-axle | 4 | 2 steer axles front, tandem rear |
| Trailer (drawbar) | 1–2 | drawbar joint + kingpin |
| Semi-truck | tractor + trailer | fifth wheel (kingpin) |
| Tracked vehicle | 2–5 road axles | suspended road wheels, chain contact between the wheels, track as drive model: [TRACKED_VEHICLE.md](TRACKED_VEHICLE.md) |

Code structure: see [ARCHITECTURE.md](ARCHITECTURE.md). Vehicle physics lives in `physics/vehicle/`
(Rapier only, no visuals); visuals are built in `render/vehicle/` from the layout (`physics/vehicle/layout.ts`).
- Dev server: port **9897** (`npm run dev`)

## 2. Controls

| Key | Function |
|---|---|
| `W` | throttle forward |
| `S` | brake; at standstill reverse |
| `A` / `D` | steer left / right (steer rate + return) |
| `Space` | **handbrake – rear axle(s) only** (locks wheels) |
| `R` | reset / upright at current position |
| `1…0` | pick suspension type (see §4) |
| later | `C` camera, vehicle choice, `T` couple/uncouple trailer |

## 3. Basic principle (simplest variant = “strut / sliding strut”)

Per wheel position (corner), a chain of bodies and joints:

```
Chassis ──[Prismatic: spring+damper]──► Strut (strut carrier)
Strut   ──[Revolute Y: steering]───────► Knuckle (steering knuckle)      (steerable wheels only)
Knuckle ──[Revolute X: wheel spin]────► Wheel  (wheel with collider)
```

Non-steerable: knuckle omitted or Strut ↔ Wheel directly via revolute.

**Spring + damper = prismatic joint position motor:**
`joint.configureMotorPosition(restPos, k, c)` with `MotorModel.ForceBased` ⇒ force `F = k·(restPos − x) − c·v`.
That is exactly spring (k in N/m) + linear damper (c in N·s/m), solved implicitly ⇒ stable even with stiff springs.
- `setLimits(min, max)` = bump/rebound travel
- shifting `restPos` = **preload / ride height**
- alternative for multi-link: `JointData.spring(restLength, k, c, a1, a2)` as separate coil between two bodies

**Steering** = position motor on revolute Y (`configureMotorPosition(angle, kSteer, cSteer)`, limits = max steer angle).
**Drive** = velocity motor on wheel revolute (`configureMotorVelocity(ω, factor)` + `setMotorMaxForce(torque)`).
**Brake/handbrake** = velocity motor with target 0 and limited max moment (= brake torque).

Why: Rapier provides spring-damper behavior directly in the solver, no custom force integration,
and other suspensions are only different joint topologies from the same parts.

## 4. Suspensions (implemented, keys 1–0)

Each suspension = one file in `physics/vehicle/parts/suspension/`, builds a **full axle** and returns only the
**wheel carrier** (`carrier`) + links/springs. Steer knuckle and wheel are always attached the same way by `finishCorner()` (common.ts).
Spring rates are converted to the wheel center via leverage (`leverRatio`, MR) → all types equally stiff.

| Key | `SuspensionType` | Topology | Spring |
|---|---|---|---|
| 1 | `strut` | Chassis ─Prismatic −Y→ Strut | prismatic motor |
| 2 | `doubleWishbone` | Chassis ─Rev Z→ lower arm ─Rev Z→ carrier; Chassis ─Rev Z→ upper arm ─Spherical→ carrier | spring joint on lower arm |
| 3 | `macPherson` | Chassis ─Spherical→ strut top ─Prismatic slanted→ carrier; Chassis ─Rev Z→ lateral link ─Rev Z→ carrier | prismatic motor |
| 4 | `trailingArm` | Chassis ─Rev X (ahead of wheel)→ arm | spring joint |
| 5 | `semiTrailingArm` | like 4, axle angled 20° | spring joint |
| 6 | `swingAxle` | Chassis ─Rev Z (center)→ half-shaft | spring joint |
| 7 | `solidAxle` | Chassis ─Prismatic −Y→ guide ─Rev Z→ axle body (both wheels) | 2 spring joints |
| 8 | `twistBeam` | 2 trailing arms + revolute X between arms with position motor (torsion) | spring joints |
| 9 | `multiLink` | 5 links: Chassis ─Spherical→ link ─Spherical→ carrier | spring joint + 2 ropes (bump/rebound stops) |
| 0 | `bogie` | Chassis ─Prismatic −Y→ carrier ─Rev X→ rocker → 2 wheels | prismatic motor |
| – | `springLeg` | Chassis ─Prismatic along the outward-angled leg (~35° from vertical)→ leg (= carrier); non-steering, no coil drawn (light-aircraft main gear) | prismatic motor (k·cos²θ) |
| – | `swingArm` | Chassis ─Rev X (ahead of wheel)→ arm with two legs; one mono-shock on the center plane | spring joint |
| – | `telescopicFork` | Chassis ─Prismatic along rake axis→ stanchion ─Rev about the same axis (steering)→ knuckle → wheel; `fork: {rake, trail}` | prismatic motor (k·cos²ε) |

Non-steerable types (4, 5, 8, 0) sit rear; front stays `strut` with steering.
Motorcycle swingarm = `trailingArm` with `track: 0`.

Additionally (part, not a suspension): `antiRollBar` – stabilizer as force from left/right spring travel difference
(`F = kRoll·(xL − xR)`), via `addForceAtPoint` per step.

## 5. Naming (mandatory)

English code names, English documentation. One part = one file.

### Hierarchy

```
Vehicle            – whole vehicle (tractor, trailer …), list of bodies + joints, input handling
 ├─ Chassis        – main body (sprung mass), CoM via collider density/mass
 ├─ Axle[]         – axle: index, position x (longitudinal), track, role (steer/drive/brake/handbrake)
 │   └─ Corner[]   – wheel position: side = 'L' | 'R' | 'C' (C = center, motorcycle)
 │       ├─ Suspension  – type + spring rate, damping, travel, preload
 │       ├─ Knuckle     – steering knuckle (optional, when steerable)
 │       └─ Wheel       – wheel body + collider, radius, width, mass, friction
 ├─ Steering       – steer model (ackermann / allWheel / crab / none), steer rate, max angle
 ├─ Drivetrain     – engine (simple torque curve), gearbox (optional), differential per axle
 ├─ Brakes         – service brake (all), handbrake (handbrake axles only)
 └─ Coupling[]     – coupling points: hitch (drawbar), fifthWheel (fifth wheel), kingPin (trailer)
```

### ID schema (body/joint names, for debug & lookup)

`<vehicle>.<axleIndex><side>.<part>` – e.g.

- `truck.chassis`
- `truck.a0L.strut`, `truck.a0L.knuckle`, `truck.a0L.wheel`
- `truck.a0L.j.suspension`, `truck.a0L.j.steer`, `truck.a0L.j.spin`
- `truck.c0.fifthWheel` ↔ `trailer.c0.kingPin`, joint `coupling:truck.c0-trailer.c0`

Axles counted **front to rear** (`a0` = foremost). Sides: `L` left, `R` right, `C` center.
Coordinates: **forward = −Z**, up = +Y, right = +X (as in Ocean project). Units SI (m, kg, N, N·m, rad).

## 6. Part list

| Part | File (under `physics/vehicle/`; *italic* = not yet implemented) | Rapier objects | Parameters |
|---|---|---|---|
| `Chassis` | `parts/chassis.ts` | dynamic rigid body, rounded frame collider (= visible ladder frame) | dimensions, mass, CoM offset, collision group |
| `Wheel` | `parts/wheel.ts` | dynamic rigid body, rounded cylinder (`cylinder`, rotated around Z, fixed 5 cm edge radius) or round convex hull (`torus`) | radius, width, mass, friction, CCD on |
| `Knuckle` | `parts/knuckle.ts` | small dynamic body (no collider, mass manual) | mass, inertia |
| `Strut` | `parts/strut.ts` | small dynamic body | mass |
| `Spring`/`Damper` | *`parts/springDamper.ts`* | motor config or `JointData.spring` | k [N/m], c [N·s/m], restLength, preload |
| `BumpStop` | *in `springDamper.ts`* | `setLimits` | min/max travel |
| `AntiRollBar` | *`parts/antiRollBar.ts`* | force per step | kRoll [N/m] |
| `Steering` | `parts/steering.ts` | revolute-Y position motor | maxAngle, rate, Ackermann factor, mode |
| `Engine` | *`parts/engine.ts`* | – (computes torque) | maxTorque, maxRpm, simple curve |
| `Differential` | *`parts/differential.ts`* | split to wheel motors | open / locked / limitedSlip |
| `Brake` | *`parts/brake.ts`* | velocity motor target 0 + MaxForce | brake torque per axle |
| `Handbrake` | *in `brake.ts`* | like brake, rear axles only | torque |
| `Hitch` / `FifthWheel` / `KingPin` | *`parts/coupling.ts`* | joint between 2 vehicles | type, angle limits |
| `Track` | `tracked/` (see [TRACKED_VEHICLE.md](TRACKED_VEHICLE.md)) | road wheels on strut suspension, chain contact, drive model | road axles, idler, sprocket, belt |

## 7. Joint list

| Joint | Rapier | Axis / DOF | Motor | Limits | Purpose |
|---|---|---|---|---|---|
| `j.suspension` | `JointData.prismatic` | local Y (or fork axis) | position (spring+damper), ForceBased | travel | suspension |
| `j.steer` | `JointData.revolute` | Y (or steer axis with trail) | position (steer angle) | ±maxAngle | steering |
| `j.spin` | `JointData.revolute` | X (wheel axis) | velocity (drive/brake) + MaxForce | – | wheel rotation |
| `j.arm` | `JointData.revolute` | X | – | swing angle | swingarm / trailing arm / lateral link |
| `j.armBall` | `JointData.spherical` | 3 rot. | – | – | lateral link ↔ knuckle |
| `j.coilover` | `JointData.spring` | distance | (spring joint) | – | coil on link suspensions |
| `j.axleRoll` | `JointData.revolute` | Z (longitudinal) | optional position (anti-roll) | articulation | solid axle |
| `j.bogie` | `JointData.revolute` | X | – | rocker angle | tandem rocker |
| `coupling.hitch` | `JointData.spherical` (or `generic`) | 3 rot. | – | hitch angle | drawbar trailer |
| `coupling.fifthWheel` | `JointData.generic` (rot. Y free, rot. X limited, rest locked) | yaw + pitch | – | pitch ±X° | fifth wheel |

Generally: `joint.setContactsEnabled(false)` between connected bodies, plus collision groups
(wheels ↔ own chassis do not collide).

## 8. Vehicle recipes (target configurations)

- **`motorcycle`**: a0C (`telescopicFork`, steerable, trail ~25°), a1C (`swingArm`, drive, handbrake). Needs `BalanceAssist`
  (roll angle controller → steer angle, counter-steer) – otherwise it falls over. Optional outriggers for first test.
- **`car`**: a0 L/R `strut` steerable (Ackermann), a1 L/R `strut` drive + handbrake. RWD/FWD/AWD via differential config.
- **`truck6x4`**: a0 steerable, a1+a2 drive (+ optional `bogie`), handbrake a1+a2.
- **`truck6x6AllWheelSteer`**: all 3 axles steerable, steer factor per axle (a0 = +1, a1 = 0…−0.3, a2 = −0.6) ⇒ opposite;
  mode `crab` = all same direction.
- **`truck8x4`**: a0+a1 steerable (a1 smaller angle, Ackermann over wheelbase), a2+a3 drive.
- **`drawbarTrailer`**: a0 on kingpin (revolute Y) + drawbar (`hitch`), a1 rigid.
- **`semiTractor` + `semiTrailer`**: tractor 4x2/6x4 with `fifthWheel`, trailer with `kingPin` + 2–3 rear axles.
- **`tank`**: implemented as a tracked vehicle, see [TRACKED_VEHICLE.md](TRACKED_VEHICLE.md): 2–5 road wheels per side
  on sliding struts, drive per side (skid steering: left/right different speed), chain visual plus chain contact
  between the wheels. Real track links (chain of boxes + revolute) were not built.

## 9. Physics rules / pitfalls (Rapier)

- **Fixed timestep**: 1/120 s in physics worker (wall-clock tick `shared/stepClock.ts`), visuals interpolate in time.
- **Chassis collider = visible shape.** An invisible, larger collider lands on ground ripples → “invisible wall”.
- **Mass ratios**: wheel/knuckle/strut not too light vs chassis (target ≤ 1:30), else joint chain bounces/jitters.
  Small helper bodies (strut, knuckle) get explicit mass + inertia (`setAdditionalMassProperties`).
- **Solver**: `world.numSolverIterations` = 8; closed chains (McPherson) additionally `setAdditionalSolverIterations` only on their bodies, optionally test joint chain as **multibody** instead of impulse joint
  (more stable on long chains, e.g. semi-truck).
- **CCD** on wheels (`setCcdEnabled(true)`) for high speed.
- **Spring sizing**: natural frequency f ≈ 1–2 Hz (car) ⇒ `k = m_corner·(2πf)²`; damping `c = 2·ζ·√(k·m_corner)`, ζ ≈ 0.3–0.5.
  Preload so static compression ≈ 30–40% of travel.
- **Tire friction**: Rapier contact friction (Coulomb) – no Pacejka. Wheel friction ~1.0–1.2, heightfield 0.95. Wheel collider:
  rounded cylinder (soft edges) or torus hull; never a ball.
- Steer and spring motors always `MotorModel.ForceBased` so k/c have physical units.
- Limit drive torque via `setMotorMaxForce` – without a limit the velocity motor is “infinitely strong”.

## Custom vehicle wheels

Per axle the custom panel offers **Wheels**: `pair` (left/right, uses `track`), `center` (one wheel, `track` 0: strut, tandem bogie, telescopic fork, swingarm) or `centerDouble` (`twin: true`: two wheels side by side on one centered `strut`, e.g. a twin nose wheel). **Wheel shape** per axle: `cylinder` (round cylinder with a fixed 5 cm edge radius, width field) or `torus` (the motorcycle's torus tire and collider; width follows from the radius). Twin wheels are spaced by the chosen width.
