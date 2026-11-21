# Vehicle Kit – status and phases

Concept, naming, parts: [VEHICLE_KIT.md](VEHICLE_KIT.md). Code structure: [ARCHITECTURE.md](ARCHITECTURE.md).

## Decisions

| Topic | Decision |
|---|---|
| Joints | impulse joints; multibody later via `jointMode` if long chains (semi-truck) jitter |
| wheel collider | `WheelSpec.shape`: `cylinder` (rounded cylinder, fixed 5 cm edge radius) or `torus` (round convex hull). Never ball colliders |
| drivetrain | no gearbox: throttle → target wheel speed `ω = vMax / r`, torque via `setMotorMaxForce`, slip limiting |
| tick | fixed 120 Hz in physics worker, `numSolverIterations = 8`, McPherson +16 only for its bodies |
| collision groups | terrain `0x1`, chassis `0x2`, wheel `0x4`; wheels do not collide with own chassis |
| helper bodies | strut/knuckle/links without collider, explicit mass + inertia |
| visuals | boxes/cylinders only, flat color; physics supplies a data layout, render builds meshes from it |

## Phases

| Phase | Contents | Status |
|---|---|---|
| 0 foundation | fixed tick, input, collision groups, IDs, sizing formulas, camera follow | ✓ |
| 1 car | chassis, cylinder wheels, strut, spring/damper, Ackermann steering, drive, brake/handbrake, HUD | ✓ (`tests/vehicle.test.ts`) |
| 1b suspensions | 10 types, keys 1–0, same wheel spring rate via leverage | ✓ (`tests/suspensions.test.ts`) |
| — infrastructure | physics worker, infinite LOD terrain (32 km), floating origin, frame collider | ✓ |
| 2 polish | `antiRollBar`, test track (ramp, waves, step), Rapier `debugRender` | open |
| 3 multi-axle | presets `truck6x4`, `truck6x6aws` (all-wheel / crab steering), `truck8x4` | open (solid axle + bogie pivot exist) |
| 4 motorcycle + moped | telescopic fork with rake/trail, swingarm, balance assist (counter-steer feedback while moving, virtual stand when slow), presets `motorcycle` + `moped` (picker entries 12/13), bike tire = apokalypto torus, visual and physics 1:1 (`WheelSpec.shape: 'torus'`, `shared/unitTorus.ts`: unit torus mesh, uniform scale Ø → width 0.6·R, collider = `roundConvexHull` of the torus vertices with apokalypto's border 11 % of tube radius, 3.5–26 mm) with rim ring; moved into its own module in phase 8 | ✓ (`tests/fork.test.ts`, `tests/balance.test.ts`) |
| 5 trailers | `coupling.ts` (hitch / fifthWheel / kingPin), drawbar trailer, semi-truck, key `T`; simple engine curve | open |
| 6 optional | gearbox, limited-slip differential (open and spooled axles, a global lock level cycled with `L`, and a slipping clutch exist: `parts/differential.ts`) | open |
| 7 tracks | tracked vehicle as its own module: sliding strut road wheels with track-wide collider, fixed idler and sprocket, left/right track drive (skid steering), chain loop and links, custom panel; see [TRACKED_VEHICLE.md](TRACKED_VEHICLE.md) | ✓ (`tests/tracked*.test.ts`) |
| 8 bike module | motorcycle and moped as their own module like tracked: `type: 'bike'`, fixed fork + swingarm + torus tires, own panel (wheelbase, radius and width per wheel, shared chassis/drive fields, rear brake torque), frame collider between the wheels, center of mass limited and fed into balance (tipping torque m·g·h, lean of the center of mass line), all other values derived; balance left the wheeled `Vehicle`; see [BIKE_VEHICLE.md](BIKE_VEHICLE.md) | ✓ (`tests/bike.test.ts`, `tests/customBike.test.ts`) |
| 8b bike: speed and cornering | single-sided swingarm (right) ✓, wheelie on Shift (`bikeWheelieTorque`) ✓, `DriveSpec.dragArea` ✓. Open: top speed (torus hull facets make the rear wheel hop above ~25 m/s: the motorcycle stalls at ~29 m/s of 47; a smooth torus collider reaches it, see BIKE_VEHICLE.md), balance above ~35 m/s, three steering regimes (manoeuvring / medium / fast with up to ~45° lean), crash detection, handlebar with grip points | in progress |
| — distant physics | coarser heightfield rings for distant objects (own collision group), from `sampleGrid` | prepared |

## Starting values car (preset `car`)
- Chassis 1.8 × 0.5 × 4.2 m (mass/inertia), collision = ladder frame; 1200 kg, CoM −0.2 m
- Wheels r = 0.33 m, 20 kg, friction 1.1
- Axles z = −1.35 / +1.35, track 1.55, travel [−0.10, +0.12]
- Springs 1.6 Hz front / 1.8 Hz rear, ζ = 0.4
- Steering max 0.6 rad, rate 2.5 rad/s, return 4 rad/s
- Drive RWD, 2400 N·m total, vMax 45 m/s, reverse 8 m/s
- Brake 1500 N·m/wheel front, 1000 rear; handbrake 3000 N·m/wheel rear

## Risks
| Risk | Mitigation |
|---|---|
| joint chain soft/jittery | raise helper body masses, iterations only for chain, multibody |
| cylinder wheel snags on terrain edges | rounded edge radius (5 cm) |
| motorcycle balance | tested at the limits (`tests/bike.test.ts`); absurd engines (350 N·m on a 0.1 m wheel) flip a light bike over backwards, as in reality |
| many bodies (semi ~40) | non-critical: physics in worker, ~0.25 ms/step today |