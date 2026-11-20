# Tracked vehicle

A tracked vehicle is a separate module with its own files. It reuses the sliding strut suspension and the wheel
collider for its road wheels, drives by the speed of its two tracks, and takes its steering from the same
`DriverInput` as every other vehicle. Concepts for wheeled vehicles: [VEHICLE_KIT.md](VEHICLE_KIT.md). Adopting
the kit in another project: [INTEGRATION_VEHICLE.md](INTEGRATION_VEHICLE.md).

## Decisions

| Topic | Decision |
|---|---|
| Layout | 2…5 road axles (sliding strut pairs) plus one idler (front) and one sprocket (rear) per side |
| Idler and sprocket | Fixed to the chassis, no collider. Position (z, y), rim radius, width like a wheel. y can be raised for the triangular profile of a tank. The chain contact wraps the front of the idler and the rear of the sprocket (arc points at 0°, 45°, 90°), so the nose acts as a climbing ramp and the ends carry and drive like the rest of the track. In the visual they turn with the chain |
| Ground contact | The road wheel collider stands for the track: a rounded cylinder as wide as the belt, radius = wheel radius + chain thickness. Sliding strut with spring and damper, exactly like a wheel. No raycasts. Plain wheel body, no extra friction |
| Contact between the wheels | `physics/vehicle/tracked/trackContact.ts`. The lower run is a taut line from wheel bottom to wheel bottom (idler and sprocket at the ends). Every 0.2 m a ray probes the world from 0.8 m above the line; where ground or an obstacle rises above the line the chain rests on it: spring-damper support along the surface normal, plus drive or brake force along the surface, limited by friction × support. Forces act on the chassis at the contact point (the light wheel bodies would be thrown around). The wheel motors supply the rest of the thrust, so the total never exceeds the engine. Static ground only, no colliders added. A log under the belly between two wheels now carries and drives the vehicle |
| Chain over the ground | The contact model also measures how far ground or an obstacle lifts the chain above its taut line, on a fixed grid per side (`shared/trackProfile.ts`, 64 cells, chassis-local z). It travels in the snapshot after the corner telemetry, and the chain visual bends the lower run with it (`deformChainLoop`), so the chain lies over a log instead of bridging it |
| Chain | Visual only. A taut belt around all wheels, computed in `shared/chainLoop.ts` (not in the main game) |
| Link spacing | Adjusted so a whole number of links fits the loop |
| Steering | A separate layer: the vehicle receives `DriverInput` (throttle 0…1, brake 0…1, steer −1 right … +1 left). A tracked vehicle turns it into left and right track speed |
| Parked | Without input the tracks hold the vehicle (idle brake share); wheels held only by rolling resistance would drift |

## Files

| File | Contents |
|---|---|
| `shared/trackedSpec.ts` | `TrackedVehicleSpec`, `TRACKED_LIMITS`, `validateTrackedSpec()`, `trackedRenderSpec()`, `designChainWheels()` |
| `shared/trackDrive.ts` | `trackCommand()`: `DriverInput` → command per track (pure) |
| `shared/chainLoop.ts` | `buildChainLoop()`, `linkLayout()` (pure geometry) |
| `shared/chainLink.ts` | `ChainLinkAsset`, `PLACEHOLDER_CHAIN_LINK`, `parseChainLink()` |
| `shared/customTracked.ts` | `CustomTrackedConfig`, `buildTrackedSpec()`, `trackedConfigFromSpec()` for the custom panel |
| `physics/vehicle/tracked/buildTracked.ts` | `buildTrackedVehicle()`: bodies, joints, colliders |
| `physics/vehicle/tracked/applyTrackDrive.ts` | `applyTrackDrive()`: sets the road wheel motors |
| `physics/vehicle/tracked/TrackedVehicle.ts` | Runtime class, like `Vehicle` |
| `physics/vehicle/presets/tracked.ts` | `TRACKED_PRESETS` (`tank`) |
| `render/vehicle/chainVisual.ts`, `trackedVisual.ts` | Links on the loop, idler and sprocket meshes |
| `app/customTrackedPanel.ts` | Tracked fields of the custom panel |

## Using it

```ts
import { TrackedVehicle, tank, neutralInput } from './physics/vehicle';
const v = new TrackedVehicle(R, world, tank, { x, y: groundY + 1, z });
// per physics step (fixed 120 Hz tick):
v.applyInput({ ...neutralInput(), throttle: 1, steer: 0.5 }, 1 / 120);
world.step();
v.updateTelemetry();
```

`createVehicle(R, world, spec, pos)` builds a `Vehicle` or a `TrackedVehicle` depending on `spec.type`
(`'tracked'` or missing = wheeled). Layout, snapshot and visual work like for a wheeled vehicle:
`describeLayout(spec, v.built)` accepts either spec; a tracked vehicle is described to the renderer as its chassis
and road axles (`layout.spec`) plus the full description in `layout.tracked`. `VehicleVisual` then draws idler,
sprocket and chain by itself (tested in `tests/integration.test.ts`).

In the demo, the vehicle dropdown lists the tracked preset after the wheeled ones (preset index = `PRESETS.length`),
and the custom panel has a vehicle type select.

## Specification

Forward = −Z, `z` and `y` are relative to the chassis origin (`y` = wheel centre height, like `AxleSpec`).

| Field | Meaning |
|---|---|
| `axles` | 2…5 road axles, front to back, `suspension: 'strut'`, `track` > 0, no steering. `wheel.radius` is the wheel without the chain |
| `idler`, `sprocket` | `{ z, y, radius, width }`, one per side |
| `track` | Distance between the centres of the left and right track |
| `beltWidth` | Width of one track (default in the panel: 0.55 m) |
| `chainThickness` | Thickness of the chain around the wheels |
| `linkAsset` | Name of the link asset |
| `drive` | `maxTorque`, `maxPower`, `reverseSpeed`, optional `maxSlipSpeed` |
| `turnSpeed` | Optional: speed difference of the tracks at full steer, default 3 m/s |

`validateTrackedSpec()` returns one message per problem: axle count, order and overlap, strut only, idler in front
of and sprocket behind the road wheels, tracks not overlapping, values within `TRACKED_LIMITS`.
`buildTrackedVehicle()` throws on an invalid spec. `buildTrackedSpec()` (custom panel) never produces an invalid
one: it corrects values instead of rejecting them.

## Driving

`trackCommand(side, input, forwardSpeed, params)` returns what one track does. Priority: handbrake, brake,
drive, idle.

- **Mixing:** throttle and steering are mixed like a tank's two sticks. Each track gets `throttle ∓ steer`; if that exceeds full power, both are scaled down together, so the turn keeps its ratio. The engine thrust is shared between the tracks by their demand, so one track alone gets all of it.
- **Throttle:** both tracks run at the vehicle speed plus the slip allowance, with their share of the thrust.
- **Steering:** steer +1 (left) slows the left track and speeds up the right one by `turnSpeed`. The slip allowance fades with steering, so the inner track does not hold the vehicle speed.
- **Turning while driving:** the inner track brakes to its slower speed. Half steer gives a wide arc (about 28 m radius at 7 m/s for the tank); full steer brakes the inner track hard, so the vehicle slows and pivots.
- **Turn on the spot:** without throttle the tracks run in opposite directions.
- **Brake:** brake at standstill reverses (up to `reverseSpeed`); brake while moving, or throttle while moving backwards, brakes. Holding the brake until it reverses is the same as on a wheeled vehicle.
- **Handbrake / no input:** both hold the vehicle with the full brake torque, so it stays parked on a slope. A tracked vehicle stops when the input is released.

`applyTrackDrive()` sets the velocity motor of every road wheel from its side's command. The thrust (torque limit at low
speed, power limit at high speed) is split evenly over the road wheels of a track. A road wheel's radius includes the
chain, so speeds are at the outer surface of the track.

### Top speed

There is no speed limit, by decision: nothing limits the speed but thrust against rolling and air drag. With the
tank preset's 400 kW, the vehicle in simulation does not get past about 13 to 16 m/s: its speed oscillates there, and
it can spin out without any steering input. The cause of that instability is not found (see Open).

### Climbing

Thrust at low speed is `maxTorque / (wheel radius + chain)`. The tank preset has 44 000 N·m, about its own weight in thrust
(weight 12.8 t = 126 kN, thrust 126 kN): enough for steep slopes. What limits the climb is traction, not torque:
measured in simulation on a plane (not part of the test suite), the tank climbs 20° at any wheel friction, 30° from a wheel friction of about 0.6
(ground friction 0.95 combines by average), and slips on 40° and more whatever the friction. Wheel friction in the preset
and the custom panel is 0.8. Turning on the spot works at every friction tried (0.3 to 1.0) at this thrust.

## Chain

`buildChainLoop(wheels, chainThickness)` computes the taut belt around the wheel circles, seen from the side (z, y).
It is the convex hull of the circles; the centre line runs half the chain thickness outside the wheel radius. The
loop is recomputed from the current wheel positions, so the chain follows the suspension. `at(s)` returns position
and travel direction at distance `s` along the loop (wraps). The lower run moves toward +z, the upper run toward −z,
so a link on top is the one on the bottom turned over; the outer side is to the right of the travel direction.
`linkLayout(length, nominalPitch)` adjusts the pitch so a whole number of links fits.

`ChainVisual` places the link asset along the loop on both sides, one instanced mesh per link part. The link is scaled
across its width to the belt width. Each track moves by the speed its road wheels turn (`wheelOmega` × contact radius).

### Link asset

`ChainLinkAsset`: boxes (`position`, `size`) in link-local axes (X across the track, Y outward, Z along the chain),
the width the link was authored for and the nominal pitch. `PLACEHOLDER_CHAIN_LINK` (plate, two lugs, pin) stands in
until `Drive_Chain_Link.json` of the main game is plugged in; `parseChainLink()` validates parsed JSON. The main
game's real file format is not known yet: adapt `parseChainLink()` when it is.

## Tests

`tests/trackedSpec.test.ts`, `trackCommand.test.ts`, `chainLoop.test.ts`, `chainVisual.test.ts`,
`trackedBody.test.ts`, `trackedDrive.test.ts`, `customTracked.test.ts`, `trackedIntegration.test.ts`, and the
public-entry test in `integration.test.ts`.

## Open

- Stability above about 13 to 16 m/s: the vehicle oscillates in speed and can spin out. Cause not found; there is no speed limit.
- The real `Drive_Chain_Link.json` format (see above).
- Sag of the upper run between the wheels: optional, not implemented. The chain is a taut hull.
- Link thickness comes from the asset, not from `chainThickness`; they should match in the real asset.
