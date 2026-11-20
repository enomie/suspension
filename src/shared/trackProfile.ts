/**
 * Ground profile of a tracked vehicle's lower run: how far the ground (or an obstacle) pushes the chain up between the
 * wheels. Physics measures it (`physics/vehicle/tracked/trackContact.ts`), rendering bends the chain with it.
 * Pure data, no Rapier/three. Travels in the snapshot as a fixed grid per side, so it interpolates like every other value.
 *
 * Grid: `TRACK_PROFILE_CELLS` cells per side from the nose of the idler to the tail of the sprocket (chassis-local z).
 * Value of a cell = lift [m] of the chain above its taut line between the wheels, along chassis up. 0 = free.
 * Layout of the array: left track cells, then right track cells.
 */
export const TRACK_PROFILE_CELLS = 64;
export const TRACK_PROFILE_LENGTH = 2 * TRACK_PROFILE_CELLS;
/** two neighbouring samples further apart than this are not bridged (a wheel sits between them) [m] */
export const PROFILE_MAX_GAP = 0.3;

export interface ProfileExtent {
  idler: { z: number; radius: number };
  sprocket: { z: number; radius: number };
  chainThickness: number;
}

/** z range [m, chassis-local] covered by the grid */
export function trackProfileRange(spec: ProfileExtent): [number, number] {
  return [spec.idler.z - spec.idler.radius - spec.chainThickness, spec.sprocket.z + spec.sprocket.radius + spec.chainThickness];
}

export interface ProfileSample {
  /** chassis-local z */
  z: number;
  /** lift [m] ≥ 0 */
  lift: number;
}

/**
 * Writes one side of the grid from samples sorted by ascending z (every probe along the run, with lift 0 where nothing
 * touches): linear between neighbours, 0 outside the samples and across gaps wider than `PROFILE_MAX_GAP`.
 */
export function fillTrackProfile(out: Float64Array, side: 0 | 1, samples: readonly ProfileSample[], z0: number, z1: number): void {
  const base = side * TRACK_PROFILE_CELLS;
  let k = 0;
  for (let i = 0; i < TRACK_PROFILE_CELLS; i++) {
    const z = z0 + ((i + 0.5) / TRACK_PROFILE_CELLS) * (z1 - z0);
    while (k + 1 < samples.length && samples[k + 1].z < z) k++;
    let v = 0;
    const a = samples[k];
    const b = samples[k + 1];
    if (a && b && a.z <= z && z <= b.z && b.z - a.z <= PROFILE_MAX_GAP) v = a.lift + ((b.lift - a.lift) * (z - a.z)) / Math.max(1e-9, b.z - a.z);
    out[base + i] = v;
  }
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
