import { Mesh } from 'three';
import { FRAME_OUTER_WIDTH, frameHalfLength, type VehicleSpec } from '../../shared/vehicleSpec';
import { UNIT_BOX_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';
import { frameTopY } from './frameVisual';

/** Fixed default height of the preview box [m] */
const BOX_HEIGHT = 0.35;
/** The box is longer than the frame by this much [m] (half at each end) */
const BOX_EXTRA_LENGTH = 0.5;

/**
 * Preview stand-in for the `collider-lower-...` block of the real game: a semi-transparent box on top of the ladder frame (same width, 0.5 m longer),
 * so handling and collisions can be judged with a body on the vehicle. Visual only: its weight is not separate,
 * the entered vehicle weight is the total. Fixed size and position (chassis-local); add to the chassis group.
 */
export function createPreviewBox(spec: VehicleSpec): Mesh {
  const mesh = new Mesh(UNIT_BOX_GEOMETRY, MAT.previewBox);
  mesh.name = 'collider-lower';
  mesh.scale.set(FRAME_OUTER_WIDTH, BOX_HEIGHT, frameHalfLength(spec) * 2 + BOX_EXTRA_LENGTH);
  mesh.position.set(0, frameTopY(spec) + BOX_HEIGHT / 2, 0);
  return mesh;
}
