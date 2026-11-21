import type { TrackedVehicleSpec } from '../../../shared/trackedSpec';
import type { AxleSpec } from '../types';

/** road axle: sliding strut pair, wheel mass like a heavy road wheel, traction for steep slopes; the tracks still skid-steer (see docs) */
const roadAxle = (z: number): AxleSpec => ({
  z,
  track: 2,
  y: -0.5,
  suspension: 'strut',
  spring: { frequencyHz: 1.5, dampingRatio: 0.5, travel: [-0.15, 0.15] },
  wheel: { radius: 0.3, width: 0.45, mass: 100, friction: 0.8, shape: 'cylinder' },
  brake: { torque: 4700 },
});

/** Medium tank: 4 road axles, idler at the front, sprocket at the rear, both a little raised */
export const tank: TrackedVehicleSpec = {
  type: 'tracked',
  name: 'tank',
  label: 'Tracked vehicle',
  chassis: { size: [2.4, 0.6, 5], mass: 12000 },
  axles: [-1.5, -0.5, 0.5, 1.5].map(roadAxle),
  idler: { z: -2.4, y: -0.25, radius: 0.2, width: 0.45 },
  sprocket: { z: 2.4, y: -0.2, radius: 0.25, width: 0.45 },
  track: 2,
  beltWidth: 0.55,
  chainThickness: 0.05,
  drive: { maxTorque: 44000, maxPower: 400_000, reverseSpeed: 5 },
};

/** Tracked presets: preset index = `PRESETS.length` + index here */
export const TRACKED_PRESETS: TrackedVehicleSpec[] = [tank];
