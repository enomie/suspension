import { VEHICLE_PRESET_LABELS } from '../../../shared/vehiclePresetLabels';
import { torusWheelWidth } from '../../../shared/unitTorus';
import type { AxleSpec, VehicleSpec, WheelSpec } from '../types';

interface BikeParams {
  name: string;
  label: string;
  wheel: WheelSpec;
  mass: number;
  wheelbase: number;
  rake: number;
  trail: number;
  forkTravel: number;
  rearTravel: number;
  frontHz: number;
  rearHz: number;
  maxTorque: number;
  /** engine power [W] */
  maxPower: number;
  brakeFront: number;
  brakeRear: number;
}

/** single-track rig: telescopic fork + swingarm, balance assist, no ladder frame drawn */
function makeBike(p: BikeParams): VehicleSpec {
  const y = -0.3;
  const half = p.wheelbase / 2;
  const wheel: WheelSpec = { ...p.wheel, hideKnuckle: true };
  const front: AxleSpec = {
    z: -half,
    track: 0,
    y,
    suspension: 'telescopicFork',
    fork: { rake: p.rake, trail: p.trail },
    spring: { frequencyHz: p.frontHz, dampingRatio: 0.4, travel: [-p.forkTravel, p.forkTravel] },
    wheel,
    steer: { maxAngle: 0.5 },
    brake: { torque: p.brakeFront },
  };
  const rear: AxleSpec = {
    z: half,
    track: 0,
    y,
    suspension: 'swingArm',
    spring: { frequencyHz: p.rearHz, dampingRatio: 0.4, travel: [-p.rearTravel, p.rearTravel] },
    wheel,
    drive: { share: 1 },
    brake: { torque: p.brakeRear },
    handbrake: { torque: p.brakeRear * 2 },
  };
  return {
    name: p.name,
    label: p.label,
    chassis: {
      size: [0.3, 0.6, p.wheelbase + 0.1],
      mass: p.mass,
      comOffset: [0, -0.1, 0.05],
      frame: false,
      // small spine under the seat so a fallen bike does not sink into the ground
      colliders: [{ shape: 'box', position: [0, -0.05, 0.05], size: [0.12, 0.3, p.wheelbase * 0.5], rounded: 0.04, friction: 0.5 }],
    },
    axles: [front, rear],
    steering: { mode: 'ackermann', rate: 3, returnRate: 5, highSpeedFactor: 0.25 },
    drive: { maxTorque: p.maxTorque, maxPower: p.maxPower, reverseSpeed: 3 },
    // slimmer springs and seats: the dampers on a bike are thin
    springStyle: 'slim',
    balance: { standSpeed: 5, maxLean: 0.6, standStiffness: p.mass * 40, standDamping: p.mass * 4 },
  };
}

export const motorcycle = makeBike({
  name: 'motorcycle',
  label: VEHICLE_PRESET_LABELS[11],
  wheel: { radius: 0.31, width: torusWheelWidth(0.31), mass: 10, friction: 1.1, shape: 'torus' },
  mass: 180,
  wheelbase: 1.4,
  rake: 0.45,
  trail: 0.1,
  forkTravel: 0.12,
  rearTravel: 0.12,
  frontHz: 2,
  rearHz: 2.2,
  maxTorque: 350,
  maxPower: 55_000,
  brakeFront: 400,
  brakeRear: 300,
});

export const moped = makeBike({
  name: 'moped',
  label: VEHICLE_PRESET_LABELS[12],
  wheel: { radius: 0.24, width: 0.19, mass: 5, friction: 1.1, shape: 'torus' },
  mass: 100,
  wheelbase: 1.15,
  rake: 0.5,
  trail: 0.07,
  forkTravel: 0.04,
  rearTravel: 0.04,
  frontHz: 2.4,
  rearHz: 2.6,
  maxTorque: 110,
  maxPower: 13_000,
  brakeFront: 150,
  brakeRear: 120,
});
