import { VEHICLE_PRESET_LABELS } from '../../../shared/vehiclePresetLabels';
import { torusWheelWidth } from '../../../shared/unitTorus';
import type { BikeVehicleSpec } from '../../../shared/bikeSpec';

/** Motorcycle: 0.31 m wheels at the apokalypto default tire width, 55 kW */
export const motorcycle: BikeVehicleSpec = {
  type: 'bike',
  name: 'motorcycle',
  label: VEHICLE_PRESET_LABELS[11],
  wheelbase: 1.4,
  front: { radius: 0.31, width: torusWheelWidth(0.31), mass: 10, friction: 1.1 },
  rear: { radius: 0.31, width: torusWheelWidth(0.31), mass: 10, friction: 1.1 },
  mass: 180,
  comOffset: [0, 0.1, 0.05],
  colliderBox: true,
  drive: { maxTorque: 350, maxPower: 55_000, reverseSpeed: 3 },
  rearBrakeTorque: 600,
};

/** Moped: small, wide tires (wider than the default 0.6·R), 13 kW */
export const moped: BikeVehicleSpec = {
  type: 'bike',
  name: 'moped',
  label: VEHICLE_PRESET_LABELS[12],
  wheelbase: 1.15,
  front: { radius: 0.24, width: 0.19, mass: 5, friction: 1.1 },
  rear: { radius: 0.24, width: 0.19, mass: 5, friction: 1.1 },
  mass: 110,
  comOffset: [0, 0.1, 0.05],
  colliderBox: true,
  drive: { maxTorque: 110, maxPower: 13_000, reverseSpeed: 3 },
  rearBrakeTorque: 240,
};

/** Bike presets: preset index = `PRESETS.length` + index here */
export const BIKE_PRESETS: BikeVehicleSpec[] = [motorcycle, moped];
