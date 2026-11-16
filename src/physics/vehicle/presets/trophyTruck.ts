import { VEHICLE_PRESET_LABELS } from '../../../shared/vehiclePresetLabels';
import type { AxleSpec, VehicleSpec, WheelSpec } from '../types';

const wheel: WheelSpec = { radius: 0.45, width: 0.4, mass: 45, friction: 1.1, shape: 'ball' };

/** Long-travel spring/damper: 75 cm of wheel travel, tall coilovers */
const spring: AxleSpec['spring'] = { frequencyHz: 1.3, dampingRatio: 0.5, travel: [-0.35, 0.4], length: 0.7 };

/**
 * Trophy truck: independent double wishbone with very long arms at the front,
 * 4-link solid axle (2 lower trailing arms + 2 upper links) at the rear, rear-wheel drive.
 */
export const trophyTruck: VehicleSpec = {
  name: 'trophy',
  label: VEHICLE_PRESET_LABELS[10],
  chassis: { size: [1.4, 0.5, 4.4], mass: 1800, comOffset: [0, -0.2, 0] },
  axles: [
    {
      z: -1.65,
      track: 2.2,
      y: -0.15,
      suspension: 'doubleWishbone',
      armSpan: 0.8,
      spring,
      wheel,
      steer: { maxAngle: 0.5 },
      brake: { torque: 3000 },
    },
    {
      z: 1.65,
      track: 2.2,
      y: -0.15,
      suspension: 'fourLink',
      spring,
      wheel,
      drive: { share: 1 },
      brake: { torque: 2500 },
      handbrake: { torque: 4000 },
    },
  ],
  steering: { mode: 'ackermann', rate: 2.5, returnRate: 4, highSpeedFactor: 0.35 },
  // above ~65 m/s the truck spins out on flat ground (measured), so boost stops just below
  drive: { maxTorque: 6000, maxSpeed: 60, maxBoostSpeed: 64, reverseSpeed: 8, rollingResistance: 15 },
};
