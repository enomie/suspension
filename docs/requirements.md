# Requirements: custom vehicle profile

Status: collecting. Nothing here is implemented yet. Open questions are marked **Q**.

## Goal
- Production status, so suspension can be integrated into other games.
- The other game needs only the **custom vehicle profile** (data), not the full app.

## 1. Handbrake per axle
- Each axle has a checkbox: "handbrake acts on this axle".
- The handbrake is independent of the normal brake, which brakes all wheels.
- Braking torque is adjustable (not necessarily a full lock).
- **Q:** Per axle, or one value for the whole vehicle?

## 2. Differential per driven axle
- Each driven axle has a setting: differential yes/no.
- If yes, it is shown as a sphere in the preview, like the instanced base geometries.
- Now: yes/no only.
- Later: a differential lock, toggled by a key press.
- **Q:** Is the key a toggle (press on/off) or hold-to-lock? Fully locked, or a lock ratio?

## 3. Vehicle weight
- The custom vehicle has an adjustable total weight.
- Effects on handling are not yet known and will be explored.
- Only the entered vehicle weight counts (total mass, kg). Nothing else adds to it, including the preview box (section 5).

## 4. Body and colliders (in the target game)
- The body is built from blocks of geometries; some have colliders, some do not.
- There is a main collider.
- Coarser colliders by name:
  - `collider-lower-...`: low friction
  - `collider-upper-...`: higher friction
- The center of mass (COM) should be settable. Whether the COM should move with these colliders is undecided; noted only.
- Decided: the COM is one global offset in the profile. Colliders are not considered for it.

## 5. Preview helper
- Above the ladder frame, show a semi-transparent `collider-lower` box with a custom weight.
- Purpose: see how handling changes and get more realistic collisions.
- Decided: fixed default size and position, not adjustable.
- Its weight is not separate: only the vehicle weight from section 3 counts.
- **Q:** Should the box be removable (toggle on/off) in the preview?
