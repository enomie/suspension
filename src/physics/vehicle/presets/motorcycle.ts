import type { AxleSpec, VehicleSpec, WheelSpec } from '../types';

const wheel: WheelSpec = { radius: 0.31, width: 0.12, mass: 10, friction: 1.1, shape: 'ball' };

/**
 * motorcycle test rig: telescopic fork + swingarm, single-track.
 * Not in `PRESETS` yet: it needs the balance assist to stay upright (tests lock the roll axis instead).
 */
export const motorcycle: VehicleSpec = {
  name: 'motorcycle',
  label: 'Motorcycle',
  chassis: { size: [0.3, 0.6, 1.5], mass: 180, comOffset: [0, -0.1, 0.05] },
  axles: [
    {
      z: -0.7,
      track: 0,
      y: -0.3,
      suspension: 'telescopicFork',
      fork: { rake: 0.45, trail: 0.1 },
      spring: { frequencyHz: 2, dampingRatio: 0.4, travel: [-0.12, 0.12] },
      wheel,
      steer: { maxAngle: 0.5 },
      brake: { torque: 400 },
    } satisfies AxleSpec,
    {
      z: 0.7,
      track: 0,
      y: -0.3,
      suspension: 'trailingArm',
      spring: { frequencyHz: 2.2, dampingRatio: 0.4, travel: [-0.12, 0.12] },
      wheel,
      drive: { share: 1 },
      brake: { torque: 300 },
      handbrake: { torque: 600 },
    } satisfies AxleSpec,
  ],
  steering: { mode: 'ackermann', rate: 3, returnRate: 5, highSpeedFactor: 0.2 },
  drive: { maxTorque: 350, maxSpeed: 50, reverseSpeed: 3, rollingResistance: 5 },
};
