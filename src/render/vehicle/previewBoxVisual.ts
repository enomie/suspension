import { Mesh } from 'three';
import type { VehicleSpec } from '../../shared/vehicleSpec';
import { UNIT_BOX_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';

/**
 * The `collider-lower` block of the spec as a semi-transparent box, so you see what the collider does. Same data as the
 * physics collider (`ChassisSpec.lowerCollider`); add to the chassis group. Returns null when the vehicle has none.
 */
export function createPreviewBox(spec: VehicleSpec): Mesh | null {
  const c = spec.chassis.lowerCollider;
  if (!c) return null;
  const mesh = new Mesh(UNIT_BOX_GEOMETRY, MAT.previewBox);
  mesh.name = 'collider-lower';
  mesh.scale.set(...c.size);
  mesh.position.set(...c.position);
  return mesh;
}
