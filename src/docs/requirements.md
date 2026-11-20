# Requirements: custom vehicle profile

Status: implemented (physics, panel, preview). Open points are marked **Q**.
How to use the profile in another project: [INTEGRATION_VEHICLE.md](INTEGRATION_VEHICLE.md), section "Custom vehicle profile".

## Goal
- Production status, so suspension can be integrated into other games.
- The other game needs only the **custom vehicle profile** (data), not the full app.

## 1. Handbrake per axle
- Each axle has a checkbox: "handbrake acts on this axle" (`CustomAxleConfig.handbrake`).
- The handbrake is independent of the normal brake, which brakes all wheels.
- One braking torque per wheel for the whole vehicle (`handbrakeTorque`, N·m); per axle only the checkbox.
- Default: rear axle only.

## 2. Differential per driven axle
- Each driven axle has a differential yes/no (`CustomAxleConfig.differential`, default yes).
  - Yes: open differential, the two wheels turn independently.
  - No: spooled axle, both wheels are forced to the same speed (a joint couples them).
- A differential is shown as a sphere at the axle centre in the preview (instanced, like the other base geometries).
- Differential lock: key `L` cycles through open, 25, 50, 75 and 100 %, then back to open; a new vehicle starts open. One global level for every differential.
  - 100 %: rigid, like a spooled axle.
  - 25 to 75 %: a slipping clutch between the two wheels, with a torque cap of `level × 15 %` of the drive torque of one driven wheel.
  - The HUD shows `diff lock open` or the percentage.
- Only left/right wheel pairs are coupled; centred and double-centred wheels have no partner.
- Decided: no lock level per axle for now. Real vehicles with several driven axles often have separate lockers; the input could become a list per axle later.

## 3. Vehicle weight
- `weight` is the total mass in kg, including the wheels. The chassis gets what remains (at least 100 kg).
- Nothing else adds mass: the preview box and all colliders have none.
- The service brake torque is sized from the weight.
- Effects on handling are still to be explored.

## 4. Body, colliders and centre of mass
- In the target game the body is built from blocks of geometries, some with colliders, some without, plus a main collider.
- Coarser colliders by name:
  - `collider-lower-...`: low friction
  - `collider-upper-...`: higher friction (not built yet)
- Decided: there is exactly one centre of mass, the global `comOffset` of the profile. Colliders carry no mass and never move it.
- Chassis width is no longer an input. Width comes from the axle `track` values, and the wheelbase gives the length.

## 5. Ladder frame and preview box
- The ladder frame is an orientation aid only: fixed outer width 0.5 m for every vehicle, length from the front to the rear axle.
- `collider-lower` box (`colliderBox` in the profile, default on):
  - as wide as the frame (0.5 m), 0.5 m longer than the frame, 0.35 m high, resting on the side rails
  - a real collider with low friction (0.15) and a semi-transparent preview mesh, both from the same data (`chassis.lowerCollider`)
  - fixed size and position, not adjustable
  - switched in the custom panel (takes effect with "Apply"); the presets have no box
