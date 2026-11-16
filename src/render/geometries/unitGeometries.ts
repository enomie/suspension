import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, RingGeometry, TorusGeometry } from 'three';
import { UNIT_TORUS_OUTER_RADIUS_M, UNIT_TORUS_RADIAL_SEGMENTS, UNIT_TORUS_TUBE_RADIUS_M, UNIT_TORUS_TUBULAR_SEGMENTS } from '../../shared/unitTorus';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * unit primitives, 1:1 as in apokalypto (`game-geometries/unit-*-geometry.ts`): edge / diameter / height = 1.
 * size always via instance matrix (scale) — code drops into apokalypto instancing later.
 */
/**
 * unit torus, 1:1 as in apokalypto (`game-geometries/unit-torus-geometry.ts`) — the bike tire (`wheel-bike`, part
 * `wheel-rubber`). Lies in the XY plane (axis Z). Constants shared with physics (`shared/unitTorus.ts`).
 * Scale uniformly to the wheel diameter, like apokalypto.
 */
export const UNIT_TORUS_GEOMETRY = new TorusGeometry(
  UNIT_TORUS_OUTER_RADIUS_M - UNIT_TORUS_TUBE_RADIUS_M,
  UNIT_TORUS_TUBE_RADIUS_M,
  UNIT_TORUS_RADIAL_SEGMENTS,
  UNIT_TORUS_TUBULAR_SEGMENTS,
);

export const UNIT_BOX_GEOMETRY = new BoxGeometry(1, 1, 1);
export const UNIT_CYLINDER_GEOMETRY = new CylinderGeometry(0.5, 0.5, 1, 32);

/** hollow cylinder as in apokalypto: outer radius 0.5, inner 0.3 (ratio 0.6), height 1, inner faces flipped */
export const UNIT_HOLLOW_INNER_RATIO = 0.6;
export const UNIT_HOLLOW_CYLINDER_GEOMETRY = (() => {
  const rOut = 0.5;
  const rIn = rOut * UNIT_HOLLOW_INNER_RATIO;
  const outer = new CylinderGeometry(rOut, rOut, 1, 32, 1, true);
  const inner = new CylinderGeometry(rIn, rIn, 1, 32, 1, true);
  const idx = inner.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const t1 = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, t1);
  }
  inner.computeVertexNormals();
  const bottom = new RingGeometry(rIn, rOut, 32, 1).rotateX(Math.PI / 2).translate(0, -0.5, 0);
  const top = new RingGeometry(rIn, rOut, 32, 1).rotateX(-Math.PI / 2).translate(0, 0.5, 0);
  return mergeGeometries([outer, inner, bottom, top], false);
})();

export const HELIX_TURNS = 6;
/** nominal length [m] for wire to look round when scaled */
const HELIX_NOMINAL_LENGTH = 0.35;
const HELIX_NOMINAL_DIAMETER = 0.13;
const HELIX_WIRE_RADIUS = 0.007;

/**
 * unit helix (spring): outer diameter 1, length 1 along Y (centered, Y −0.5…+0.5 like unit cylinder), `HELIX_TURNS` turns.
 * scale (d, l, d) per instance for diameter and length — pitch follows length.
 * wire cross-section precomputed for nominal size so non-uniform scale
 * stays round (slightly oval at extreme lengths).
 */
export const UNIT_HELIX_GEOMETRY = (() => {
  const steps = HELIX_TURNS * 40;
  const around = 8;
  const rx = HELIX_WIRE_RADIUS / HELIX_NOMINAL_DIAMETER; // wire radius in unit X/Z
  const ry = HELIX_WIRE_RADIUS / HELIX_NOMINAL_LENGTH; // … in unit Y
  const R = 0.5 - rx;
  const pos: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = t * HELIX_TURNS * Math.PI * 2;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    // wire centerline from y = −0.5 + ry to 0.5 − ry so ends stay inside spring seats
    const y = -0.5 + ry + t * (1 - 2 * ry);
    for (let j = 0; j < around; j++) {
      const phi = (j / around) * Math.PI * 2;
      const radial = R + Math.cos(phi) * rx;
      pos.push(c * radial, y + Math.sin(phi) * ry, sn * radial);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      index.push(a, b, a + around, b, b + around, a + around);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
})();

/** Unit sphere, same as apokalypto (`unit-sphere-geometry.ts`): diameter 1 */
export const UNIT_SPHERE_GEOMETRY = new IcosahedronGeometry(0.5, 3);
