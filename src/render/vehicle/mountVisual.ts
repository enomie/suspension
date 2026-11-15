import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../../shared/vehicleSpec';
import { UNIT_BOX_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';

const PLATE_SIZE = 0.09; // [m] square edge
const PLATE_THICKNESS = 0.015; // [m]

/**
 * Mount plates: a flat square box at every point where the suspension is bolted to the chassis
 * (hinge bearings, spring and strut tops). Static in chassis space, so add `mesh` to the chassis group.
 * One draw call. These belong to the suspension, not to the frame.
 */
export function createMountPlates(mounts: Vec3[]): InstancedMesh {
  const mesh = new InstancedMesh(UNIT_BOX_GEOMETRY, MAT.mount, Math.max(mounts.length, 1));
  mesh.count = mounts.length;
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3(PLATE_SIZE, PLATE_THICKNESS, PLATE_SIZE);
  mounts.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.compose(new Vector3(x, y, z), q, s)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
