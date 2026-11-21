# Tracked vehicle

A tracked vehicle is a separate module with its own files. It reuses the sliding strut suspension and the wheel
collider for its road wheels, drives by the speed of its two tracks, and takes its steering from the same
`DriverInput` as every other vehicle. Between the road wheels the chain itself touches the ground: it carries weight
and drives over obstacles. Concepts for wheeled vehicles: [VEHICLE_KIT.md](VEHICLE_KIT.md). Adopting the kit in another
project: [INTEGRATION_VEHICLE.md](INTEGRATION_VEHICLE.md).

## How it works

| Topic | Decision |
|---|---|
| Layout | 2…5 road axles (sliding strut pairs, spring and damper like a wheeled vehicle) plus one idler (front) and one sprocket (rear) per side |
| Road wheels | A rounded cylinder as wide as the belt, radius = wheel radius + chain thickness, on a sliding strut. Plain wheel body, no extra friction |
| Idler and sprocket | Fixed to the chassis, no collider. Position (z, y), rim radius, width like a wheel; y can be raised for the triangular profile of a tank. The chain wraps them like every other wheel. In the visual they turn with the chain |
| Lower run of the chain | `shared/trackPath.ts`, used by physics and rendering. The chain runs under every wheel and follows it: an arc around each wheel from the point where it runs on to the point where it leaves (the radius there is perpendicular to the chain), and the straight tangent under both circles between two wheels. A wheel that hangs high because something is under it lifts the chain with it. Idler (first circle) and sprocket (last circle) belong to the path |
| Contact between the wheels | `physics/vehicle/tracked/trackContact.ts`. Rays probe the world from 0.8 m above the lower run: per free stretch between two road wheels one ray per 0.15 m (3 at least, 8 at most, 5 per gap on the tank), none on the arc of a road wheel or within 0.12 m of it (the wheel collider is there). Where ground or an obstacle rises above the chain, the chain rests on it: spring-damper support along the surface normal plus drive or brake force along the surface, limited by friction × support. Forces act on the chassis at the contact point (the light wheel bodies would be thrown around). The wheel motors supply the rest of the thrust, so the total never exceeds the engine. No colliders are added; static ground only (no reaction on the surface) |
| Which surfaces count | A hit supports the chain only if its normal faces up in the world and faces the chain. Rapier turns a ray hit's normal toward the ray origin, so an upside-down vehicle would otherwise find the ground from underneath; it gets no support and no chain lift |
| Chain over the ground | Once per tick, one ray per cell measures how far ground or an obstacle lifts the chain above the lower run, on a fixed grid per side (`shared/trackProfile.ts`, 64 cells, chassis-local z). The profile travels in the snapshot after the corner telemetry. The chain visual bends the lower run by it (`deformChainLoop`), so the chain lies over a log instead of bridging it. On a log it stays within about 8 cm of the surface (the rest is the steep flank, which the 6 cm cells cannot follow) |
| Chain | Visual only. The upper side is the taut belt (convex hull) around all wheels, the lower side follows the lower run path, both in `shared/chainLoop.ts` |
| Link spacing | Adjusted so a whole number of links fits the loop |
| Steering | A separate layer: the vehicle receives `DriverInput` (throttle 0…1, brake 0…1, steer −1 right … +1 left). A tracked vehicle turns it into left and right track speed |
| No input | Rolling: both tracks coast, only rolling resistance acts (8 % of the weight, `TRACK_ROLLING_COEFFICIENT`: about 16 s from 14 m/s to a stop). Almost stopped (below 0.6 m/s): the tracks hold with the idle brake share, so a parked vehicle stays |

## Files

| File | Contents |
|---|---|
| `shared/trackedSpec.ts` | `TrackedVehicleSpec`, `TRACKED_LIMITS`, `validateTrackedSpec()`, `trackedRenderSpec()`, `designChainWheels()` |
| `shared/trackDrive.ts` | `trackCommand()`: `DriverInput` → command per track (pure) |
| `shared/trackPath.ts` | `lowerRunPath()`, `lowerRunY()`, `samplePath()`: the chain under the wheels (pure geometry) |
| `shared/trackProfile.ts` | Ground profile grid of the chain: `trackProfileRange()`, `trackLiftAt()`, constants |
| `shared/chainLoop.ts` | `buildChainLoop()`, `deformChainLoop()`, `linkLayout()` (pure geometry) |
| `shared/chainLink.ts` | `ChainLinkAsset`, `CHAIN_LINK`: the one chain link |
| `shared/customTracked.ts` | `CustomTrackedConfig`, `buildTrackedSpec()`, `trackedConfigFromSpec()` for the custom panel |
| `physics/vehicle/tracked/buildTracked.ts` | `buildTrackedVehicle()`: bodies, joints, colliders |
| `physics/vehicle/tracked/applyTrackDrive.ts` | `applyTrackDrive()`: sets the road wheel motors |
| `physics/vehicle/tracked/trackContact.ts` | `TrackContact`: contact between the wheels, ground profile |
| `physics/vehicle/tracked/TrackedVehicle.ts` | Runtime class, like `Vehicle` |
| `physics/vehicle/presets/tracked.ts` | `TRACKED_PRESETS` (`tank`) |
| `render/vehicle/chainVisual.ts`, `trackedVisual.ts` | Links on the loop, idler and sprocket meshes |
| `app/customTrackedPanel.ts` | Tracked fields of the custom panel |
| `app/comFields.ts` | Center of mass fields, shared by the wheeled and the tracked panel |

## Using it

```ts
import { TrackedVehicle, tank, neutralInput } from './physics/vehicle';
const v = new TrackedVehicle(R, world, tank, { x, y: groundY + 1, z });
// per physics step (fixed 120 Hz tick):
v.applyInput({ ...neutralInput(), throttle: 1, steer: 0.5 }, 1 / 120);
world.step();
v.updateTelemetry(); // also measures the ground profile for the chain visual
```

`createVehicle(R, world, spec, pos)` builds a `Vehicle` or a `TrackedVehicle` depending on `spec.type`
(`'tracked'` or missing = wheeled). Layout, snapshot and visual work like for a wheeled vehicle:
`describeLayout(spec, v.built)` accepts either spec; a tracked vehicle is described to the renderer as its chassis
and road axles (`layout.spec`) plus the full description in `layout.tracked`. `VehicleVisual` then draws idler,
sprocket and chain by itself (tested in `tests/integration.test.ts`).

The snapshot of a tracked vehicle carries the ground profile (`v.trackProfile`, `TRACK_PROFILE_LENGTH` values) between
the corner telemetry and the bodies. `writeVehicleSnapshot` writes it, `VehicleVisual` reads it, `blendSnapshots` takes the
extra length as its last argument. A game with its own renderer passes `v.trackProfile` and `lowerRunPath()` to its chain.

In the demo, the vehicle dropdown lists the tracked preset after the wheeled ones (preset index = `PRESETS.length`),
and the custom panel has a vehicle type select. The demo scene starts with a test obstacle (see README: `?logs=0`
removes it).

## Specification

Forward = −Z, `z` and `y` are relative to the chassis origin (`y` = wheel centre height, like `AxleSpec`).

| Field | Meaning |
|---|---|
| `axles` | 2…5 road axles, front to back, `suspension: 'strut'`, `track` > 0, no steering. `wheel.radius` is the wheel without the chain |
| `idler`, `sprocket` | `{ z, y, radius, width }`, one per side |
| `track` | Distance between the centres of the left and right track |
| `beltWidth` | Width of one track (default in the panel: 0.55 m) |
| `chainThickness` | Thickness of the chain around the wheels |
| `drive` | `maxTorque`, `maxPower`, `reverseSpeed`, optional `maxSlipSpeed` |
| `turnSpeed` | Optional: speed difference of the tracks at full steer, default 3 m/s |
| `chassis.lowerCollider` | Optional low friction block on the frame, like a wheeled vehicle (panel: Collider box) |

`validateTrackedSpec()` returns one message per problem: axle count, order and overlap, strut only, idler in front
of and sprocket behind the road wheels, tracks not overlapping, values within `TRACKED_LIMITS`.
`buildTrackedVehicle()` throws on an invalid spec. `buildTrackedSpec()` (custom panel) never produces an invalid
one: it corrects values instead of rejecting them.

### Custom panel

Fields: road axles, wheelbase (first to last road axle, axles evenly spaced, wide wheels push them apart), wheel
radius; track, belt width, chain thickness; idler and sprocket (distance from the outer axle, height above the road
wheels, radius, width); collider box (low friction); weight, center of mass offset (x, y, z, same limits and fields as the wheeled panel), torque (up to 100 000 N·m), power (up to 20 000 kW),
turn speed.

## Driving

`trackCommand(side, input, forwardSpeed, params)` returns what one track does. Priority: handbrake, brake,
drive, idle.

- **Mixing:** throttle and steering are mixed like a tank's two sticks. Each track gets `throttle ∓ steer`; if that exceeds full power, both are scaled down together, so the turn keeps its ratio. The engine thrust is shared between the tracks by their demand, so one track alone gets all of it.
- **Throttle:** both tracks run at the vehicle speed plus the slip allowance, with their share of the thrust.
- **Steering:** steer +1 (left) slows the left track and speeds up the right one by `turnSpeed`. The slip allowance fades with steering, so the inner track does not hold the vehicle speed.
- **Turning while driving:** the inner track brakes to its slower speed. Half steer gives a wide arc (about 28 m radius at 7 m/s for the tank); full steer brakes the inner track hard, so the vehicle slows and pivots.
- **Steering without throttle:** rolling, the inner track brakes to its slower speed and the outer track coasts free (no drive), so the vehicle turns and slows. Standing, the tracks run in opposite directions: the vehicle turns on the spot.
- **Brake:** brake at standstill reverses (up to `reverseSpeed`); brake while moving, or throttle while moving backwards, brakes both tracks. Holding the brake until it reverses is the same as on a wheeled vehicle.
- **Handbrake:** both tracks hold with the handbrake torque.
- **No input:** rolling, coasting; almost stopped, holding (see the table above).

`applyTrackDrive()` sets the velocity motor of every road wheel from its side's command. The thrust (torque limit at low
speed, power limit at high speed) is split evenly over the road wheels of a track, minus what the contacts between the
wheels already deliver. A road wheel's radius includes the chain, so speeds are at the outer surface of the track.
Coasting sets the wheel motors to speed 0 with the rolling resistance as their only torque.

### Top speed

There is no speed limit, by decision: nothing limits the speed but thrust against rolling and air drag. With the
tank preset's 400 kW on flat ground at full throttle, the vehicle reaches about 32 m/s after 20 s; after that its speed
falls again and its heading drifts (about 12° after 50 s). Accepted as is (see Known behavior).

### Climbing

Thrust at low speed is `maxTorque / (wheel radius + chain)`. The tank preset has 44 000 N·m, about its own weight in thrust
(weight 12.8 t = 126 kN, thrust 126 kN). Wheel friction in the preset and the custom panel is 0.8 (ground friction 0.95
combines by average).

## Chain

`buildChainLoop(wheels, chainThickness)` computes the taut belt around the wheel circles, seen from the side (z, y). It
is the convex hull of the circles; the centre line runs half the chain thickness outside the wheel radius. The loop is
recomputed from the current wheel positions, so the chain follows the suspension. `at(s)` returns position and travel
direction at distance `s` along the loop (wraps). The lower run moves toward +z, the upper run toward −z, so a link on
top is the one on the bottom turned over; the outer side is to the right of the travel direction.

`deformChainLoop(loop, lift, floor)` bends the lower side over the ground: y = max(loop, `floor(z)`) + `lift(z)`.
`floor` is the lower run path (`lowerRunY`), `lift` the measured ground profile. The loop is sampled every 5 cm; its
length grows with the bend. `linkLayout(length, nominalPitch)` adjusts the pitch so a whole number of links fits.

`ChainVisual` places `CHAIN_LINK` along the loop on both sides, one instanced mesh per link part. The link is scaled
across its width to the belt width. Each track moves by the speed its road wheels turn (`wheelOmega` × contact radius).

### Chain link

`CHAIN_LINK` is the one link every tracked vehicle uses: boxes (`position`, `size`) in link-local axes (X across the track,
Y outward, Z along the chain), the width it was authored for (stretched to `beltWidth`) and the nominal pitch. Two boxes:
a plate and a grouser on its outer side, inset 5 % from the plate edges on every side. The
inner side stays within 0.025 m of the centre line, the grouser reaches 0.03 m outward, which fits the default chain
thickness of 0.05 m. The vehicle spec carries no link data.

## Tests

`tests/trackedSpec.test.ts`, `trackCommand.test.ts`, `trackPath.test.ts`, `trackProfile.test.ts`, `chainLoop.test.ts`,
`chainVisual.test.ts` (chain link included), `trackedBody.test.ts`, `trackedDrive.test.ts` (driving, coasting, steering while rolling),
`trackLogs.test.ts` (ten logs, 10…90 % buried: the vehicle crosses them, the chain lies on them, a tipped-over vehicle
gets no support), `customTracked.test.ts`, `trackedIntegration.test.ts`, and the public-entry test in
`integration.test.ts`.

## Known behavior (accepted)

- Top speed: above about 30 m/s the vehicle loses speed and its heading drifts. There is no speed limit, by decision.
- Slopes: on a flat plane with tilted gravity the tank climbs 20°. At 15° and more it does not hold or climb reliably:
  once it rolls faster than 0.6 m/s without throttle it coasts, like a wheeled vehicle.

## Not implemented

- Sag of the upper run between the wheels: optional. The upper side of the chain is taut.
