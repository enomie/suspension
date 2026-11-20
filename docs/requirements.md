# Requirements: custom vehicle profile

Status: collecting. Nothing here is implemented yet. Open questions are marked **Q**.

## Goal
- Production status, so suspension can be integrated into other games.
- The other game needs only the **custom vehicle profile** (data), not the full app.

## 1. Handbrake per axle
- Each axle has a checkbox: "handbrake acts on this axle".
- The handbrake is independent of the normal brake, which brakes all wheels.
- **Q:** Should the handbrake fully lock the wheels or apply a configurable torque?

## 2. Differential per driven axle
- Each driven axle has a setting: differential yes/no.
- If yes, it is shown as a sphere in the preview, like the instanced base geometries.
- **Q:** Open or limited-slip (lock ratio)? Or only yes/no for now?

## 3. Vehicle weight
- The custom vehicle has an adjustable total weight.
- Effects on handling are not yet known and will be explored.
- **Q:** Unit (kg)? Is the weight the total mass or the added mass on top of the chassis?

## 4. Body and colliders (in the target game)
- The body is built from blocks of geometries; some have colliders, some do not.
- There is a main collider.
- Coarser colliders by name:
  - `collider-lower-...`: low friction
  - `collider-upper-...`: higher friction
- The center of mass (COM) should be settable. Whether the COM should move with these colliders is undecided; noted only.
- **Q:** Is the COM one global offset in the profile, or derived from the colliders?

## 5. Preview helper
- Above the ladder frame, show a semi-transparent `collider-lower` box with a custom weight.
- Purpose: see how handling changes and get more realistic collisions.
- **Q:** Adjustable size/position, or a fixed default?
- **Q:** Is the weight of this box included in the vehicle weight (section 3) or separate?
