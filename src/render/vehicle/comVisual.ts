import { Mesh } from 'three';
import type { VehicleSpec } from '../../shared/vehicleSpec';
import { UNIT_SPHERE_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';

const COM_DIAMETER = 0.16; // [m]

/**
 * Debug marker: a white sphere at the centre of mass (`chassis.comOffset`, relative to the chassis box centre).
 * Drawn on top of everything so it stays visible inside the body. Add to the chassis group.
 */
export function createComMarker(spec: VehicleSpec): Mesh {
  const mesh = new Mesh(UNIT_SPHERE_GEOMETRY, MAT.com);
  mesh.name = 'com';
  mesh.scale.setScalar(COM_DIAMETER);
  mesh.position.set(...(spec.chassis.comOffset ?? [0, 0, 0]));
  mesh.renderOrder = 10;
  return mesh;
}
