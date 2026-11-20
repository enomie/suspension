import { BoxGeometry, BufferGeometry, Mesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frameHalfLength, type VehicleSpec } from '../../shared/vehicleSpec';
import { MAT } from './materials';

const RAIL = 0.1; // frame profile [m]

function box(w: number, h: number, l: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(Math.max(w, 0.02), Math.max(h, 0.02), Math.max(l, 0.02)).translate(x, y, z);
}

/** Height of the top of the side rails in chassis space [m] */
export function frameTopY(spec: VehicleSpec): number {
  return -spec.chassis.size[1] / 2 + RAIL + 0.1;
}

/**
 * Ladder frame instead of a body (chassis-local, 1 draw call): 2 side rails (front axle to rear axle) and one cross member per axle.
 * Frame only: everything the suspension needs (mount plates, joints) belongs to the suspension (`MountRenderer`).
 * The physics collider has the same length (`frameHalfLength`), so nothing invisible sticks out.
 */
export function createFrameVisual(spec: VehicleSpec): Mesh {
  const [w, h] = spec.chassis.size;
  const l = frameHalfLength(spec) * 2; // rails end at the outer axles
  const railX = w * 0.25;
  const y = -h / 2 + RAIL / 2 + 0.1;
  const parts = [box(RAIL, RAIL, l, -railX, y, 0), box(RAIL, RAIL, l, railX, y, 0)];
  for (const z of spec.axles.map((a) => a.z)) {
    parts.push(box(railX * 2 - RAIL * 0.1, RAIL * 0.82, RAIL * 0.78, 0, y, z));
  }
  const m = new Mesh(mergeGeometries(parts), MAT.frame);
  m.castShadow = true;
  return m;
}
