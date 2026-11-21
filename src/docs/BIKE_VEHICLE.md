# Bike (motorcycle, moped)

A bike is a separate module with its own files, like the [tracked vehicle](TRACKED_VEHICLE.md). Its layout is always
the same: one front wheel on a telescopic fork (steers), one rear wheel on a swingarm (drives), apokalypto torus tires,
balance assist. So its spec and panel only hold what actually differs between bikes: the wheelbase, the two wheels,
and the chassis and drive values every vehicle has. Everything else is derived. It takes its steering from the same
`DriverInput` as every other vehicle. Concepts for wheeled vehicles: [VEHICLE_KIT.md](VEHICLE_KIT.md).

## How it works

| Topic | Decision |
|---|---|
| Layout | Fixed: front `telescopicFork`, rear `swingArm`, one centered wheel each. No axle count, no track, no suspension choice |
| Tires | Always the apokalypto torus (`shared/unitTorus.ts`), visual and collider 1:1. Radius and width per wheel; the width is free within 0.2…0.8 × radius (axial scale, `torusAxialScale`), the apokalypto default is 0.6 × radius (`torusWheelWidth`) |
| Reuse | `bikeVehicleSpec()` turns the bike into a wheeled description; the builder then uses the regular `telescopicFork`, `swingArm` and `finishCorner`. No copied joint code |
| Steering | The input asks for a lean (a turn), not a steer angle. `Balance` turns it into the fork angle: feed-forward for the steady turn plus feedback on the lean; the gains scale with the wheelbase (the curvature of a steer angle is ∝ 1/L). The wheeled `Vehicle` and `Steering` know nothing about balance |
| Stand | Below `standSpeed` a virtual stand (roll torque, PD) fades in so the bike does not fall over at rest; at speed 30 % of it stays on as a light "rider" that pulls toward the lean of the commanded turn |
| Frame box | Not the vehicle box: a narrow rounded box on the center line between the two tires, clear of both (the front gap includes how far the compressed fork moves the wheel back), from the higher axle line up to about seat height. Low friction, so a fallen bike slides. "Collider box" off = no chassis collider at all, only the tires collide |
| Weight | Total including both wheels; the chassis (sprung mass) is the rest |

### Center of mass and tipping

| Axis | Effect | Handling |
|---|---|---|
| x (lateral) | The bike balances with the center of mass over the tires, so the chassis tilts the other way | Limited to ±5 cm. `Balance` controls the lean of the line from the tire contact to the center of mass (`BalanceSpec.comLean`), not the chassis lean; otherwise it would steer against the offset all the time |
| y (height) | Higher = falls faster | Stand stiffness and damping scale with the tipping torque m·g·h (sprung mass × height above the ground), not with the mass alone. At least 10 cm above the ground |
| z (longitudinal) | Outside the wheelbase the bike tips over an axle | Kept 15 % of the wheelbase inside either axle. Far back with a strong engine gives wheelies, far forward under full brake gives stoppies: real physics, covered by tests |

### Derived values

`shared/bikeSpec.ts`, from wheelbase, wheel radii, weight and center of mass:

| Value | Rule |
|---|---|
| Ride height | Chassis box height 2 × the larger radius (at least 0.3 m); the larger wheel's center at the bottom of the box, both tires on one ground line |
| Fork | Rake 0.45 rad (26°), trail 0.32 × front radius; clamp, slider and lower bearing scale with the wheel radius (`telescopicFork.ts`) |
| Travel | ±0.39 × wheel radius, front and rear |
| Springs | 2 Hz front, 2.2 Hz rear, damping ratio 0.4 |
| Steering lock | 0.5 rad |
| Swingarm | Pivot about two rear radii ahead of the axle (at least 0.5 m), never reaching the front tire (`AxleSpec.armLength`) |
| Service brakes | Front 0.65 × weight × front radius, rear 0.5 × weight × rear radius; the handbrake is `rearBrakeTorque` |
| Balance | `bikeBalance()`: stand stiffness 8 × m·g·h, damping 0.8 s × m·g·h, stand speed 5 m/s, max lean 0.6 rad, `comLean` |
| Frame box | `bikeFrameBox()`: width 0.5 × larger radius (0.15…0.25 m), height 0.9 × larger radius (at least 0.12 m) |
| Shortest wheelbase | `minBikeWheelbase()`: both radii, both tire gaps and a 0.1 m frame box fit between the axles (two 0.1 m wheels: 0.5 m, two 0.6 m wheels: 1.49 m) |

## Panel

Vehicle type "Bike" in the custom panel (`app/customBikePanel.ts`); picking the motorcycle or moped preset fills it.

| Field | Limits / default (motorcycle) |
|---|---|
| Wheelbase (m) | 0.5…3, 1.4; grows on Apply until the wheels and the frame fit |
| Front wheel / Rear wheel: Radius (m), Width (m) | radius 0.1…1, 0.31; width 0.2…0.8 × radius, 0.186 |
| Collider box (low friction) | the frame box, on |
| Weight (kg) | 30…2000, 180 |
| Center of mass x / y / z (m) | 0 / −0.1 / 0.05, clamped into the limits above |
| Rear brake torque (N·m) | 0…5000, 600 |
| Torque (N·m) | 20…5000, 350 |
| Power (kW) | 1…500, 55 |
| Wheelspin (m/s) | 2.5…15, 2.5 |
| Top speed | computed (thrust = rolling + air drag) |

Apply builds the bike with `buildBikeSpec()`, which corrects instead of rejecting, and writes the corrected values back
into the fields.

## Files

| File | Contents |
|---|---|
| `shared/bikeSpec.ts` | `BikeVehicleSpec`, `BalanceSpec`, `BIKE_LIMITS`, `validateBikeSpec()`, `bikeVehicleSpec()`, `bikeBalance()`, `bikeFrameBox()`, `bikeComLimits()`, `minBikeWheelbase()` |
| `shared/customBike.ts` | `CustomBikeConfig`, `buildBikeSpec()`, `bikeConfigFromSpec()` for the panel |
| `shared/anyVehicleSpec.ts` | `AnyVehicleSpec`: wheeled, tracked or bike |
| `physics/vehicle/bike/buildBike.ts` | `buildBikeVehicle()`: validates, then builds the derived wheeled description |
| `physics/vehicle/bike/BikeVehicle.ts` | Runtime class: input smoothing, balance, fork angle, drive, brakes |
| `physics/vehicle/bike/balance.ts` | `Balance`: steering controller and virtual stand |
| `physics/vehicle/presets/bike.ts` | `BIKE_PRESETS` (`motorcycle`, `moped`) |
| `app/customBikePanel.ts` | Bike fields of the custom panel |

## Using it

```ts
import { BikeVehicle, motorcycle, neutralInput } from './physics/vehicle';
const v = new BikeVehicle(R, world, motorcycle, { x, y: groundY + 0.7, z });
// per physics step (fixed 120 Hz tick):
v.applyInput({ ...neutralInput(), throttle: 1, steer: 0.5 }, 1 / 120);
world.step();
v.updateTelemetry();
```

`createVehicle(R, world, spec, pos)` builds a `BikeVehicle` when `spec.type === 'bike'`. `describeLayout()` describes
the bike to the renderer as its derived wheeled description (`layout.spec`) plus the bike itself (`layout.bike`), so
`VehicleVisual` draws it without bike-specific code.

## Tests

`tests/bike.test.ts`: presets, spec rules, geometry across the limits (wheels apart, frame box clear of both tires,
fork legs and clamp clear of the tire, swingarm pivot between the tires), stand and riding at the extremes (smallest,
largest, center of mass off to the side, high center of mass, mixed wheel sizes), wheelie and stoppie, frame collider,
simulation. `tests/customBike.test.ts`: panel profile, clamping, round trip. `tests/balance.test.ts`: the two presets.
`tests/fork.test.ts`: the fork on its own (roll locked).
