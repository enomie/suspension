# Tracked vehicle

A tracked vehicle is a separate module with its own files. It reuses the sliding strut suspension and the wheel
collider for its road wheels, drives by the speed of its two tracks, and takes its steering from the same
`DriverInput` as every other vehicle. Concepts for wheeled vehicles: [VEHICLE_KIT.md](VEHICLE_KIT.md). Adopting
the kit in another project: [INTEGRATION_VEHICLE.md](INTEGRATION_VEHICLE.md).

## Decisions

| Topic | Decision |
|---|---|
| Layout | 2…5 road axles (sliding strut pairs) plus one idler (front) and one sprocket (rear) per side |
| Idler and sprocket | Fixed to the chassis, they neither move nor rotate. Position (z, y), rim radius, width like a wheel. y can be raised for the triangular profile of a tank. Small collider (`END_COLLIDER_RADIUS_SHARE` = 50 % of the rim radius) so they never catch on terrain |
| Ground contact | The road wheel collider stands for the track: a rounded cylinder as wide as the belt, radius = wheel radius + chain thickness. Sliding strut with spring and damper, exactly like a wheel. No raycasts. Plain wheel body, no extra friction |
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
| `turnSpeed` | Optional: speed difference of the tracks at full steer, default 2.5 m/s |

`validateTrackedSpec()` returns one message per problem: axle count, order and overlap, strut only, idler in front
of and sprocket behind the road wheels, tracks not overlapping, values within `TRACKED_LIMITS`.
`buildTrackedVehicle()` throws on an invalid spec. `buildTrackedSpec()` (custom panel) never produces an invalid
one: it corrects values instead of rejecting them.

## Driving

`trackCommand(side, input, forwardSpeed, params)` returns what one track does. Priority: handbrake, brake,
drive, idle.

- **Throttle:** both tracks run at the vehicle speed plus the slip allowance, with up to the throttle's share of the thrust.
- **Steering:** steer +1 (left) slows the left track and speeds up the right one by `turnSpeed`. The slip allowance fades with steering, so the inner track does not hold the vehicle speed and fight the turn.
- **Turn on the spot:** without throttle the tracks run in opposite directions.
- **Brake:** brake at standstill reverses (up to `reverseSpeed`); brake while moving, or throttle while moving backwards, brakes. Holding the brake until it reverses is the same as on a wheeled vehicle.
- **Handbrake / no input:** the handbrake parks the vehicle; with no input the tracks hold it with 30 % of the brake torque.

`applyTrackDrive()` sets the velocity motor of every road wheel from its side's command. The torque cap is the thrust
(torque limit at low speed, power limit at high speed) split evenly over all road wheels. A road wheel's radius includes
the chain, so speeds are at the outer surface of the track.

Skid steering needs low friction: a heavy vehicle with car-like wheel friction (1.1) hardly turns. The preset and the custom
panel use 0.3.

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

- The real `Drive_Chain_Link.json` format (see above).
- Sag of the upper run between the wheels: optional, not implemented. The chain is a taut hull.
- Link thickness comes from the asset, not from `chainThickness`; they should match in the real asset.
