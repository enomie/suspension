/**
 * Unit torus of apokalypto (`game-geometries/unit-torus-geometry.ts`) as pure data — the bike tire (`wheel-bike`,
 * part `wheel-rubber`). Used by physics (collider hull) and rendering, so both stay identical.
 *
 * Geometry: `THREE.TorusGeometry(ring, tube, 16, 32)` in the XY plane (axis Z), outer radius 0.5, tube radius 0.15.
 * apokalypto scales the tire uniformly to the wheel diameter (`wheelRootScaleForTargetRadiusM`), so the default tube
 * is 0.3·Ø wide (= 0.6·R). A wider or narrower tire only changes the axial scale (part size z), like in the blueprint.
 */
export const UNIT_TORUS_OUTER_RADIUS_M = 0.5;
export const UNIT_TORUS_TUBE_RADIUS_M = 0.15;
const RING_RADIUS_M = UNIT_TORUS_OUTER_RADIUS_M - UNIT_TORUS_TUBE_RADIUS_M;
export const UNIT_TORUS_RADIAL_SEGMENTS = 16;
export const UNIT_TORUS_TUBULAR_SEGMENTS = 32;

/** apokalypto torus collider: hull border = 11 % of the tube radius, clamped (`unit-primitive-physics-shape.ts`) */
const HULL_BORDER_FRAC_OF_TUBE = 0.11;
const HULL_BORDER_MIN_M = 0.0035;
const HULL_BORDER_MAX_M = 0.026;

/** default tire width [m] of a torus wheel with this radius (tube diameter at uniform scale Ø) */
export function torusWheelWidth(radius: number): number {
  return UNIT_TORUS_TUBE_RADIUS_M * 2 * (radius * 2);
}

/** axial scale of the unit torus for a tire of this width [m] (uniform scale Ø gives `torusWheelWidth`) */
export function torusAxialScale(width: number): number {
  return width / (UNIT_TORUS_TUBE_RADIUS_M * 2);
}

/** `roundConvexHull` border radius [m]; `scale` = smallest part scale (apokalypto: `min(sx, sy, sz)`) */
export function torusHullBorder(scale: number): number {
  const tube = UNIT_TORUS_TUBE_RADIUS_M * scale;
  return Math.min(HULL_BORDER_MAX_M, Math.max(HULL_BORDER_MIN_M, HULL_BORDER_FRAC_OF_TUBE * tube));
}

/**
 * Vertices of the unit torus, same order as `THREE.TorusGeometry` (seam vertices included, as apokalypto feeds the
 * mesh positions to the hull), scaled by `diameter` in the rolling plane and `axial` along the axle, and turned so
 * the axis is X (wheel axle): (x, y, z) → (z, y, −x).
 */
export function torusHullPoints(diameter: number, axial: number = diameter): Float32Array {
  const out = new Float32Array((UNIT_TORUS_RADIAL_SEGMENTS + 1) * (UNIT_TORUS_TUBULAR_SEGMENTS + 1) * 3);
  let k = 0;
  for (let j = 0; j <= UNIT_TORUS_RADIAL_SEGMENTS; j++) {
    for (let i = 0; i <= UNIT_TORUS_TUBULAR_SEGMENTS; i++) {
      const u = (i / UNIT_TORUS_TUBULAR_SEGMENTS) * Math.PI * 2;
      const v = (j / UNIT_TORUS_RADIAL_SEGMENTS) * Math.PI * 2;
      const x = (RING_RADIUS_M + UNIT_TORUS_TUBE_RADIUS_M * Math.cos(v)) * Math.cos(u);
      const y = (RING_RADIUS_M + UNIT_TORUS_TUBE_RADIUS_M * Math.cos(v)) * Math.sin(u);
      const z = UNIT_TORUS_TUBE_RADIUS_M * Math.sin(v);
      out[k++] = z * axial;
      out[k++] = y * diameter;
      out[k++] = -x * diameter;
    }
  }
  return out;
}
