import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { hasDifferential, type VehicleSpec } from '../../shared/vehicleSpec';
import { UNIT_SPHERE_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';

const DIFFERENTIAL_DIAMETER = 0.22; // [m]

/**
 * Differential markers: one sphere at the centre of every axle that has a differential (`hasDifferential`:
 * driven, a left and a right wheel, `differential !== false`).
 * Static in chassis space (the axle centre is fixed relative to the chassis), so add `mesh` to the chassis group.
 * One draw call.
 */
export function createDifferentialMarkers(spec: VehicleSpec): InstancedMesh {
  const axles = spec.axles.filter(hasDifferential);
  const mesh = new InstancedMesh(UNIT_SPHERE_GEOMETRY, MAT.differential, Math.max(axles.length, 1));
  mesh.name = 'differential';
  mesh.count = axles.length;
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3(DIFFERENTIAL_DIAMETER, DIFFERENTIAL_DIAMETER, DIFFERENTIAL_DIAMETER);
  axles.forEach((a, i) => mesh.setMatrixAt(i, m.compose(new Vector3(0, a.y, a.z), q, s)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
