# Bike (motorcycle, moped)

> **Status: planned, not implemented yet.** This document is the design for phase 8 in
> [VEHICLE_PLAN.md](VEHICLE_PLAN.md). Today the bikes are still wheeled `VehicleSpec` presets with a `balance` field
> (`physics/vehicle/presets/motorcycle.ts`); this document describes where they move to.

A bike is a separate module with its own files, like the [tracked vehicle](TRACKED_VEHICLE.md). It always has the
same layout: one front wheel on a telescopic fork, one rear wheel on a swingarm, torus tires, balance assist. So its
spec and panel only expose what actually differs between bikes: wheelbase, the two wheels, and the shared chassis and
drive values. Everything else is derived. It takes its steering from the same `DriverInput` as every other vehicle.
Concepts for wheeled vehicles: [VEHICLE_KIT.md](VEHICLE_KIT.md).

## How it works

| Topic | Decision |
|---|---|
| Layout | Fixed: front `telescopicFork` (steers), rear `swingArm` (drives), one centered wheel each. No axle count, no track, no suspension choice |
| Tires | Always the apokalypto torus (`shared/unitTorus.ts`), visual and collider 1:1. Radius and width per wheel; width is free via the axial scale (`torusAxialScale`), default `torusWheelWidth(R)` = 0.6·R |
| Reuse | The builder calls the existing `telescopicFork` and `swingArm` builders and `finishCorner`; no copied joint code |
| Balance | Moves out of the wheeled vehicle: `parts/balance.ts` is only used by `BikeVehicle`. `VehicleSpec.balance`, `Vehicle.balance` and `Steering.balanceOffset` are removed |
| Collider box | Matches the bike frame, not the vehicle box: a narrow rounded box on the center line between the two tires (clear of both, also at full fork travel), from about axle height to seat height, low friction so a fallen bike slides. Size and position are derived from wheelbase and radii, no own fields |
| Center of mass | Editable like on the other vehicles, but it decides how the bike tips, so it is limited and fed into the balance (see below) |

### Center of mass and tipping

| Axis | Effect | Handling |
|---|---|---|
| x (lateral) | A constant pull to one side that balance has to hold against | Clamped to a few centimeters; test that the stand still holds the bike upright when stopped |
| y (height) | Higher = falls faster, steers slower | Stand stiffness, damping and balance gains scale with weight × CoM height above ground (the tipping torque), not with weight alone |
| z (longitudinal) | Outside the wheelbase the bike tips over an axle | Clamped to the wheelbase minus a margin. Far back gives wheelies, far forward gives stoppies under strong torque or brakes; that is real physics, covered by a test |

### Derived values (not in the panel)

Derived from wheelbase, wheel radii, weight and CoM height, so a moped and a motorcycle behave differently without
extra fields:

- ride height (today fixed `y = -0.3`)
- fork: clamp height, slider length and lower bearing (today constants, would sit inside a 1 m tire)
- swingarm length (today at least 0.5 m; limited by the wheelbase)
- rake, trail, fork and swingarm travel, spring frequency, steering lock
- front brake torque
- balance: stand speed, stand stiffness and damping, feedback gains
- collider box

## Panel

Own panel, like the tracked one; center of mass fields shared through `app/comFields.ts`.

| Field | Limits / default |
|---|---|
| Wheelbase (m) | 0.5–3 |
| Front wheel: Radius (m), Width (m) | radius 0.1–1; width about 0.2–0.8·R |
| Rear wheel: Radius (m), Width (m) | same |
| Collider box (low friction) | frame box between the wheels (see above) |
| Weight (kg) | default 180 |
| Center of mass x (m) | clamped to a few cm |
| Center of mass y (m) | |
| Center of mass z (m, − = front) | clamped inside the wheelbase |
| Rear brake torque (N·m) | replaces "Handbrake torque per wheel": a bike has one handbrake wheel |
| Torque (N·m) | |
| Power (kW) | |
| Wheelspin (m/s) | |
| Top speed | |

Clamping rules (in the spirit of `shared/customRules.ts`): wheelbase ≥ front radius + rear radius + frame gap, so the
wheels never overlap; at a 0.5 m wheelbase this caps the radii at about 0.2 m. Tire width stays inside the fork legs
(`legClearance`).

## Files (planned)

| File | Contents |
|---|---|
| `shared/bikeSpec.ts` | `BikeVehicleSpec` (`type: 'bike'`), `BIKE_LIMITS`, `validateBikeSpec()` |
| `shared/customBike.ts` | `CustomBikeConfig`, `buildBikeSpec()`, `bikeConfigFromSpec()` for the panel |
| `physics/vehicle/bike/buildBike.ts` | `buildBikeVehicle()`: chassis, frame collider, fork, swingarm, derived values |
| `physics/vehicle/bike/BikeVehicle.ts` | Runtime class with balance, like `Vehicle` |
| `physics/vehicle/presets/bike.ts` | `BIKE_PRESETS` (`motorcycle`, `moped`; replaces `presets/motorcycle.ts`) |
| `app/customBikePanel.ts` | Bike fields of the custom panel |

`createVehicle(R, world, spec, pos)` also builds a `BikeVehicle` when `spec.type === 'bike'`.

## Tests (planned)

- the stand holds the bike upright when stopped, at the limits and with an off-center CoM
- wheelie with the CoM far back, stoppie with it far forward
- wheels never overlap; fork legs stay clear of the tire, across the limits
- panel config → spec → config round trip
- existing `tests/fork.test.ts`, `tests/balance.test.ts` and the bike cases in `topSpeed`, `torusWheel`,
  `customVehicle` move to the new spec
