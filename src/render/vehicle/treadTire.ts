import { BoxGeometry, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WheelSpec } from '../../shared/vehicleSpec';
import { UNIT_HOLLOW_CYLINDER_GEOMETRY } from '../geometries/unitGeometries';

/**
 * Tread tire, ported from apokalypto (`reifenprofi/reifenprofi-tire-profile-generator.ts`, rubber only):
 * `count` tread blocks around the circumference, `rows` rows across the width (each row shifted by `staggerDeg`),
 * `crown` = how far the outer rows sit below the center row, so the cross-section is rounded like a bike tire.
 * Block placement is the same math as `generateTireProfileParts` (block center on a circle, rotated tangentially).
 */
export interface TreadSettings {
  count: number;
  rows: number;
  /** tangential length of one block [m] */
  blockLength: number;
  /** radial thickness of one block [m] */
  blockThickness: number;
  /** outer rows sit this much lower than the center row [m] */
  crown: number;
  staggerDeg: number;
}

/** sensible tread for a wheel: blocks about as long as they are thick, 3 rows on narrow tires */
export function treadFor(spec: WheelSpec): TreadSettings {
  const blockLength = Math.max(0.03, spec.radius * 0.16);
  return {
    count: Math.max(12, Math.round((2 * Math.PI * spec.radius) / (blockLength * 1.5))),
    rows: spec.width < 0.2 ? 3 : 5,
    blockLength,
    blockThickness: Math.max(0.015, spec.radius * 0.08),
    crown: spec.width * 0.12,
    staggerDeg: 6,
  };
}

const cache = new Map<string, BufferGeometry>();

/**
 * Tire geometry in wheel space: axle along X, merged into one buffer (1 draw call).
 * Apokalypto lays the tire in the XY plane with the axle on Z; the whole tire is turned onto X at the end.
 */
export function createTreadTireGeometry(spec: WheelSpec, tread: TreadSettings = treadFor(spec)): BufferGeometry {
  const key = JSON.stringify([spec.radius, spec.width, tread]);
  const hit = cache.get(key);
  if (hit) return hit;

  const parts: BufferGeometry[] = [];
  const rowWidth = spec.width / tread.rows;
  const rowCenter = (tread.rows - 1) / 2;
  const outer = spec.radius - tread.blockThickness / 2;

  for (let row = 0; row < tread.rows; row++) {
    const rowT = tread.rows === 1 ? 0 : (row - rowCenter) / rowCenter; // −1 … 1
    const rowRadius = outer - tread.crown * Math.abs(rowT) ** 2;
    const z = (row - rowCenter) * rowWidth;
    for (let k = 0; k < tread.count; k++) {
      const deg = (k / tread.count) * 360 + row * tread.staggerDeg;
      const a = (deg * Math.PI) / 180;
      const m = new Matrix4().compose(
        new Vector3(Math.sin(a) * rowRadius, Math.cos(a) * rowRadius, z),
        new Quaternion().setFromEuler(new Euler(0, 0, -a)),
        new Vector3(tread.blockLength, tread.blockThickness, rowWidth * 0.92),
      );
      parts.push(new BoxGeometry(1, 1, 1).applyMatrix4(m));
    }
  }
  // thin carcass under the blocks so the tire reads as closed (unit hollow cylinder: axis Y, Ø1, height 1)
  const carcassR = spec.radius - tread.blockThickness * 0.8;
  parts.push(
    UNIT_HOLLOW_CYLINDER_GEOMETRY.clone()
      .scale(carcassR * 2, spec.width * 0.9, carcassR * 2)
      .rotateX(Math.PI / 2), // axis Y → Z, like the apokalypto tire plane
  );
  // apokalypto axle = Z → suspension wheel axle = X
  const geo = mergeGeometries(parts, false).rotateY(Math.PI / 2);
  for (const p of parts) p.dispose();
  cache.set(key, geo);
  return geo;
}
