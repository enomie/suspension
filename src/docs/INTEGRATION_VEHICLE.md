# Adopting the vehicle kit in another project

Goal: replace a **raycast vehicle controller** with real physics. Wheels are rigid bodies with colliders,
suspensions are real joint chains, springs and dampers run in the Rapier solver. Plus hookup to an
**asset editor** that builds vehicles from primitives.

## 1. Raycast vehicle vs. this kit
| | Raycast vehicle | This kit |
|---|---|---|
| Wheel | ray + imagined cylinder | rigid body with collider (sphere or round cylinder), real friction |
| Spring/damper | custom force math per frame | joint motor (`ForceBased`) or spring joint, implicit in solver → stable with stiff springs |
| Suspension | only “vertical spring” | 10 types with real kinematics (camber, track, articulation, rocker) |
| Edges/steps | ray “hops” | wheel rolls over edge |
| Cost | very low | 15–40 bodies per vehicle, ~0.2 ms per step (Rapier SIMD) |

## 2. Minimal integration (without worker)
Tested in `tests/integration.test.ts`:
```ts
import { Vehicle, PRESETS, describeLayout, poseBodies, writeVehicleSnapshot } from './physics/vehicle';
import { VehicleVisual } from './render/vehicle';

world.timestep = 1 / 120;          // matched to 120 Hz
world.numSolverIterations = 8;
const spec = PRESETS[0];
const vehicle = new Vehicle(R, world, spec, { x, y: groundY + 1.2, z });
const bodies = poseBodies(vehicle.built);
const visual = new VehicleVisual(describeLayout(spec, vehicle.built));
scene.add(visual.root);

// per physics step (fixed tick!):
vehicle.applyInput({ throttle, brake, steer, handbrake }, 1 / 120);
world.step();
vehicle.updateTelemetry();          // optional (HUD)

// per frame:
visual.apply(writeVehicleSnapshot(vehicle, bodies, { origin: ORIGIN }));
```
Switch/reset: `vehicle.dispose()` (removes all bodies), `visual.dispose()`, rebuild.
With worker (as here): adopt `physics/worker.ts` + `app/PhysicsClient.ts`. Time interpolation,
generations against “stale frames”, and layout via message are already solved there; see [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Conventions
| Topic | Value |
|---|---|
| Axes | **forward = −Z**, up = +Y, right = +X; left = side `L` (−X) |
| Units | SI: m, kg, N, N·m, rad, s |
| Tick | fixed 120 Hz, 8 solver iterations (McPherson sets +16 only for its bodies). At 60 Hz soften springs and test. |
| Collision groups | bits `0x1` terrain, `0x2` chassis, `0x4` wheel (`physics/vehicle/groups.ts`). Adjust when colliding with own groups. |
| Ground | friction ~0.95; wheels 1.1 |
| Input | `throttle` 0…1, `brake` 0…1 (at rest = reverse), `steer` −1 (right) … +1 (left), `handbrake` bool, `diffLock` bool (optional), `boost` bool (optional) |
| IDs | `<vehicle>.a<axle><side>.<part>`, e.g. `car.a0L.wheel` (`ids.ts`) |

## 4. Hooking up the asset editor
The editor builds vehicles from primitives. Here vehicles are built from a **`VehicleSpec`**
(`shared/vehicleSpec.ts`, pure data). The bridge is a function `editorAsset → VehicleSpec`.

### 4.0 Editor with raycast wheel points (only “here is a wheel”): `specFromWheelPoints()`
One point per wheel is enough. From that comes the full spec (`physics/vehicle/fromWheelPoints.ts`, tested in
`tests/integration.test.ts`):
```ts
const { spec, warnings } = specFromWheelPoints(
  editorWheels.map((w) => ({ position: [w.x, w.y, w.z], radius: w.radius, width: w.width })),
  {
    name: 'buggy',
    pointIs: 'suspensionTop', // raycast start at chassis …
    restLength: 0.25,         // … wheel center this far below (= raycast rest length)
    suspension: ['doubleWishbone', 'multiLink'], // per axle, default 'strut'
    // steer: [0], drive: [1], handbrake: [1]     // default: front steers, rear drives + handbrake
    chassis: { mass: 900, size: [1.7, 0.5, 3.8], colliders: editorColliders },
  },
);
```
| Step | Rule |
|---|---|
| Form axles | points with same longitudinal z (± `axleTolerance`, 0.25 m) = one axle; front = smallest z |
| Track | distance left ↔ right wheel in X; 1 point = single centered wheel (`track 0`) |
| Height | wheel center = point (`wheelCenter`) or point − `restLength` (`suspensionTop`, typical for raycast) |
| Roles | frontmost axle steers, rearmost drives + handbrake; multiple drive axles share torque equally |
| Springs, brakes, steering, drive | values like `makeCar()`, via `options` or mutate `spec` after |
| Messy model | asymmetric axle, unequal heights, > 2 wheels per axle → averages + entry in `warnings` |

Mapping typical raycast parameters:
| Raycast vehicle | here |
|---|---|
| `suspensionRestLength` | `restLength` (wheel center only) + `spring.travel` (bump/rebound) |
| `suspensionStiffness` (often “per mass”) | `spring.frequencyHz` (1.2–2 Hz) – rate computed from axle load |
| `dampingCompression/Relaxation` | `spring.dampingRatio` (ζ 0.3–0.5, symmetric) |
| `frictionSlip` | `wheel.friction` (Coulomb friction, ~1.0–1.2) |
| `maxSuspensionForce` | omitted (stops via `travel`) |
| `rollInfluence` | omitted – real kinematics; anti-roll bar planned (VEHICLE_PLAN phase 2) |
| motor force per wheel | `drive.maxTorque` (total) × `drive.share` (per axle) |

Note single-track (motorcycle): builds correctly but falls without balance controller (VEHICLE_PLAN phase 4).

### 4.1 What the editor must supply → where it goes
| In editor | in `VehicleSpec` | Note |
|---|---|---|
| body/frame primitives (collision) | `chassis.colliders: ColliderPrimitive[]` | box / sphere / capsule / cylinder, position + rotation chassis-local, `rounded` for edge rounding. **As close as possible to visible shape**, else “invisible wall”. |
| total mass, CoM | `chassis.mass`, `chassis.comOffset` | mass from spec, **not** from primitive volume (colliders have density 0). `comOffset` is the only centre of mass; no collider moves it. |
| dimensions (inertia) | `chassis.size` | box approximation for inertia; also the frame height. The ladder frame itself has a fixed width (`FRAME_OUTER_WIDTH`, 0.5 m) |
| body block (low friction) | `chassis.lowerCollider` | optional `collider-lower` box: `size`, `position`, `friction`; no mass. Preview mesh comes from the same data |
| wheel position (center) | axle: `z` (longitudinal), `y` (height), `track` | wheels per axle **symmetric** left/right; `track: 0` = single centered wheel (motorcycle) |
| wheel dimensions | `axles[i].wheel`: `radius`, `width`, `mass`, `friction`, `shape` | `ball` = robust on terrain, `roundCylinder` = more realistic |
| suspension type per axle | `axles[i].suspension` | one of 10, see 4.2 |
| springs | `axles[i].spring`: `frequencyHz`, `dampingRatio`, `travel: [bump, rebound]` | frequency instead of spring rate. Rate from axle load → correct ride height per weight. Or `stiffness`/`damping` directly. |
| steering | `axles[i].steer.maxAngle`, global `steering` | Ackermann per axle automatic; rear axles steer opposite, `crab` = same direction |
| drive | `axles[i].drive.share`, global `drive` (`maxTorque`, `maxPower`, `reverseSpeed`; optional boost limiter `maxBoostSpeed`) | torque/power split via `share`. **Top speed is not an input:** it is where thrust (per driven axle `min(torque/r, P/v)`) = rolling (40 N per wheel, identical everywhere) + air drag (`½·1.2·0.8·v²`, identical everywhere); `topSpeed(spec)` in `shared/performance.ts` computes it. Boost cuts the drag area to ¼. |
| brakes | `axles[i].brake.torque`, `handbrake.torque` | handbrake only on axles with `handbrake` (any axle, independent of the service brake) |
| differential | `axles[i].differential` | driven axles only; `false` = spooled axle (wheels coupled), otherwise open. `DriverInput.diffLock` locks every differential |
| tandem | `bogieSpacing` | `bogie` only |
| visible meshes | **not** in spec | hang editor meshes on bodies, see 4.3 |

Starting point for custom vehicles: `makeCar(name, label, type)` from `presets/car.ts` returns a full spec;
editor overrides individual fields. Tested in `tests/integration.test.ts`.

### 4.2 Suspensions: what the editor can set vs. what is fixed
Mount points (link lengths, strut top position, etc.) are generated by builders from axle (`z`, `y`, `track`),
wheel, and travel. Editor picks type and parameters, **not** individual joint points.

| Type | steerable | fixed in builder |
|---|---|---|
| `strut` sliding strut | yes | vertical guide |
| `doubleWishbone` | yes | link lengths/heights relative to track |
| `macPherson` | yes | strut top, lateral link; leverage from statics |
| `trailingArm` / `semiTrailingArm` | no | arm length 0.55 m, angle 20° |
| `swingAxle` | yes | pivot at vehicle center |
| `solidAxle` | yes | axle body across both wheels |
| `twistBeam` | no | arm length 0.55 m, torsion stiffness 0.6 × wheel rate |
| `multiLink` | yes | 5 link points (table in `multiLink.ts`) |
| `bogie` tandem rocker | no | rocker, wheel spacing `bogieSpacing` |

**If the editor should set custom joint points (“hardpoints”):** extension point is optional `hardpoints` object on `AxleSpec`
per type, used by the respective builder instead of fixed values
(`physics/vehicle/parts/suspension/<type>.ts`). Spring rate must still be converted to wheel center via `leverRatio`/`springFor`,
else types sit at different ride heights.

### 4.3 Visuals from editor instead of default visuals
`VehicleVisual` draws ladder frame, wheels, links, springs, and dampers. For editor models:
- **Body**: editor mesh as child of `visual.chassis` (group, follows chassis body), hide default frame.
- **Wheels**: per corner `layout.corners[i].wheel` = body index → pose via `visual.position(index, v)` / `visual.rotation(index, q)`.
  Wheel mesh rotates around local X.
- **Links/springs**: `layout.links` lists two body points per part (`a`, `b` with body index + local point).
  Custom meshes can stretch (pattern: `stretch()` in `render/vehicle/linkVisual.ts`).
- Important: poses always come from the snapshot, even without worker, so visuals and physics share one source.

### 4.4 Editor bridge checklist
1. Coordinates: forward = −Z? If not, rotate on export.
2. Wheels per axle on same `z`/`y`, symmetric? Else split axle or extend builder.
3. Collider primitives match visible shape, bottom **rounded** (`rounded` ≥ 0.03 m).
4. Ground clearance: chassis collider bottom ≥ wheel bottom + bump travel + margin.
5. Mass/CoM from editor, not from primitives.
6. Springs as frequency (1.2–2 Hz car, 2–3 Hz sport), damping ζ 0.3–0.5.
7. Add test: vehicle rests at design height, drives, steers, stays upright
   (template: `tests/suspensions.test.ts`, `tests/invisibleWall.test.ts`).

## 4.5 Custom vehicle profile (the part another game needs)
Pure data in `shared/customVehicle.ts`; `buildCustomSpec(config)` turns it into a `VehicleSpec` (invalid values are clamped or corrected,
limits in `CUSTOM_LIMITS`), `customFromSpec(spec)` goes back. Use `DEFAULT_CUSTOM` as the starting point.

| Field | Meaning |
|---|---|
| `wheelbase` | front to rear axle [m], axles spaced evenly |
| `weight` | total mass in kg including wheels; chassis mass = weight − wheels |
| `comOffset` | the one centre of mass `[x, y, z]` relative to the chassis box centre (−z = front) |
| `torque`, `power`, `wheelspin` | drive: traction limit [N·m], engine power [kW], slip limit [m/s] |
| `handbrakeTorque` | handbrake torque per wheel [N·m], one value for the vehicle |
| `colliderBox` | add the low-friction `collider-lower` block (collider and preview) |
| `axles[i]` | `wheels` (pair / center / centerDouble), `track`, `steer`, `suspension`, `drive`, `differential`, `handbrake`, `wheelShape`, `wheelRadius`, `wheelWidth` |

```ts
const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, weight: 1800, comOffset: [0, -0.3, 0] });
const vehicle = new Vehicle(R, world, spec, pos);
vehicle.applyInput({ throttle, brake, steer, handbrake, diffLock }, 1 / 120);   // diffLock: your toggle key
```
The game holds the diff-lock state itself (the demo toggles it with `L`). Rendering: `VehicleVisual` shows the differential spheres
and the preview box; a game with its own meshes uses `spec.chassis.lowerCollider` and the axles' `differential` flags directly.
Tests: `tests/customVehicle.test.ts`, `tests/differential.test.ts`, `tests/lowerCollider.test.ts`.

## 5. Important rules (Rapier)
- Fixed tick, else spring behavior changes with frame rate.
- Helper bodies (strut, knuckle, links) have **no collider**, but explicit mass/inertia, not too light
  vs chassis (≤ 1:30), else the chain jitters.
- A driven axle without differential (or with the lock on) gets a joint between its two wheels; `Vehicle.differentials` creates and removes it. Do not remove wheel bodies without `vehicle.dispose()`.
- Wheels with CCD. Always limit drive torque (`setMotorMaxForce`), else motor is “infinitely strong”.
- Joint contacts between connected bodies off; wheels do not collide with own chassis.
- Details: [VEHICLE_KIT.md](VEHICLE_KIT.md) §9.