import { VEHICLE_PRESET_LABELS } from '../../../shared/vehiclePresetLabels';
import type { AxleSpec, SuspensionType, VehicleSpec, WheelSpec } from '../types';

const wheel: WheelSpec = { radius: 0.33, width: 0.22, mass: 20, friction: 1.1, shape: 'ball' };

/** layouts that cannot steer → front stays strut */
const NON_STEERABLE: SuspensionType[] = ['trailingArm', 'semiTrailingArm', 'twistBeam', 'bogie'];

function frontAxle(type: SuspensionType): AxleSpec {
  return {
    z: -1.35,
    track: 1.55,
    y: -0.25,
    suspension: NON_STEERABLE.includes(type) ? 'strut' : type,
    spring: { frequencyHz: 1.6, dampingRatio: 0.4, travel: [-0.1, 0.12] },
    wheel,
    steer: { maxAngle: 0.6 },
    brake: { torque: 1500 },
  };
}

function rearAxle(type: SuspensionType): AxleSpec {
  return {
    z: 1.35,
    track: 1.55,
    y: -0.25,
    suspension: type,
    spring: { frequencyHz: 1.8, dampingRatio: 0.4, travel: [-0.1, 0.12] },
    wheel,
    drive: { share: 1 },
    brake: { torque: 1000 },
    handbrake: { torque: 3000 },
    bogieSpacing: type === 'bogie' ? 0.9 : undefined,
  };
}

/** car test rig: same frame, rear drive, only suspension changes. */
export function makeCar(name: string, label: string, type: SuspensionType): VehicleSpec {
  return {
    name,
    label,
    chassis: { size: [1.8, 0.5, 4.2], mass: 1200, comOffset: [0, -0.2, 0] },
    axles: [frontAxle(type), rearAxle(type)],
    steering: { mode: 'ackermann', rate: 2.5, returnRate: 4, highSpeedFactor: 0.35 },
    // top speed ≈ 90 m/s: P = v·(rolling + drag) at 90 m/s ≈ 364 kW (rolling and drag are global, see performance.ts)
    drive: { maxTorque: 2400, maxPower: 364_000, reverseSpeed: 8 },
  };
}

/** default car (strut) */
export const car = makeCar('car', VEHICLE_PRESET_LABELS[0], 'strut');
