import type { TrackedVehicleSpec } from '../../../shared/trackedSpec';
import type { AxleSpec } from '../types';
import { PLACEHOLDER_CHAIN_LINK } from '../../../shared/chainLink';

/** road axle: sliding strut pair, wheel mass like a heavy road wheel, low friction so the tracks can skid-steer */
const roadAxle = (z: number): AxleSpec => ({
  z,
  track: 2,
  y: -0.5,
  suspension: 'strut',
  spring: { frequencyHz: 1.5, dampingRatio: 0.5, travel: [-0.15, 0.15] },
  wheel: { radius: 0.3, width: 0.45, mass: 100, friction: 0.3, shape: 'cylinder' },
  brake: { torque: 4000 },
});

/** Medium tank: 4 road axles, raised sprocket at the rear, idler at the front */
export const tank: TrackedVehicleSpec = {
  type: 'tracked',
  name: 'tank',
  label: 'Tracked vehicle',
  chassis: { size: [2.4, 0.6, 5], mass: 12000 },
  axles: [-1.5, -0.5, 0.5, 1.5].map(roadAxle),
  idler: { z: -2.4, y: -0.35, radius: 0.3, width: 0.45 },
  sprocket: { z: 2.4, y: -0.05, radius: 0.35, width: 0.45 },
  track: 2,
  beltWidth: 0.55,
  chainThickness: 0.05,
  linkAsset: PLACEHOLDER_CHAIN_LINK.name,
  drive: { maxTorque: 24000, maxPower: 400_000, reverseSpeed: 5 },
};

/** Tracked presets: preset index = `PRESETS.length` + index here */
export const TRACKED_PRESETS: TrackedVehicleSpec[] = [tank];
