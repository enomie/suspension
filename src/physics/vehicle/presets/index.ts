import { VEHICLE_PRESET_LABELS } from '../../../shared/vehiclePresetLabels';
import type { VehicleSpec } from '../types';
import { car, makeCar } from './car';

/** Preset-Index → Aufhängungsprinzip (gleicher Testträger). */
export const PRESETS: VehicleSpec[] = [
  car,
  makeCar('wishbone', VEHICLE_PRESET_LABELS[1], 'doubleWishbone'),
  makeCar('macpherson', VEHICLE_PRESET_LABELS[2], 'macPherson'),
  makeCar('trailing', VEHICLE_PRESET_LABELS[3], 'trailingArm'),
  makeCar('semitrailing', VEHICLE_PRESET_LABELS[4], 'semiTrailingArm'),
  makeCar('swing', VEHICLE_PRESET_LABELS[5], 'swingAxle'),
  makeCar('solid', VEHICLE_PRESET_LABELS[6], 'solidAxle'),
  makeCar('twist', VEHICLE_PRESET_LABELS[7], 'twistBeam'),
  makeCar('multilink', VEHICLE_PRESET_LABELS[8], 'multiLink'),
  makeCar('bogie', VEHICLE_PRESET_LABELS[9], 'bogie'),
];
