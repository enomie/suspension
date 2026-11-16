import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { JointVisual, Vec3 } from '../types';

/** shared build context for all parts of a vehicle. */
export interface BuildContext {
  R: typeof RAPIER;
  world: RAPIER.World;
  /** vehicle name (ID prefix) */
  name: string;
  /** world position of chassis origin at spawn */
  origin: { x: number; y: number; z: number };
  chassis: RAPIER.RigidBody;
  /** static sprung mass per axle [kg] */
  axleSprungMass: number[];
  /** Chassis-local points where suspension parts are bolted to the chassis (from chassis-side joints) */
  mounts: Vec3[];
  /** Joint markers collected while building (see `JointVisual`) */
  joints: JointVisual[];
  /** Body-Handle → ID (Debug/Lookup) */
  names: Map<number, string>;
}

export const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };
