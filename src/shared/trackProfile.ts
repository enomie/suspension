/**
 * Ground profile of a tracked vehicle's lower run: how far the ground (or an obstacle) pushes the chain up between the
 * wheels. Physics measures it (`physics/vehicle/tracked/trackContact.ts`), rendering bends the chain with it.
 * Pure data, no Rapier/three. Measured once per tick by a ray per cell straight from the world. Travels in the snapshot as a fixed grid per side, so it interpolates like every other value.
 *
 * Grid: `TRACK_PROFILE_CELLS` cells per side from the nose of the idler to the tail of the sprocket (chassis-local z).
 * Value of a cell = lift [m] of the chain above its taut line between the wheels, along chassis up. 0 = free.
 * Layout of the array: left track cells, then right track cells.
 */
export const TRACK_PROFILE_CELLS = 64;
export const TRACK_PROFILE_LENGTH = 2 * TRACK_PROFILE_CELLS;
export interface ProfileExtent {
  idler: { z: number; radius: number };
  sprocket: { z: number; radius: number };
  chainThickness: number;
}

/** z range [m, chassis-local] covered by the grid */
export function trackProfileRange(spec: ProfileExtent): [number, number] {
  return [spec.idler.z - spec.idler.radius - spec.chainThickness, spec.sprocket.z + spec.sprocket.radius + spec.chainThickness];
}

/** lift at chassis-local z for one side (linear between cell centres, 0 outside the grid) */
export function trackLiftAt(profile: ArrayLike<number>, offset: number, side: 0 | 1, z: number, z0: number, z1: number): number {
  const f = ((z - z0) / (z1 - z0)) * TRACK_PROFILE_CELLS - 0.5;
  if (f < -0.5 || f > TRACK_PROFILE_CELLS - 0.5) return 0;
  const i = Math.max(0, Math.min(TRACK_PROFILE_CELLS - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  const base = offset + side * TRACK_PROFILE_CELLS;
  return profile[base + i] * (1 - t) + profile[base + i + 1] * t;
}
