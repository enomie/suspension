import type RAPIER from '@dimforge/rapier3d-simd-compat';

/** Gemeinsamer Bau-Kontext für alle Bauteile eines Fahrzeugs. */
export interface BuildContext {
  R: typeof RAPIER;
  world: RAPIER.World;
  /** Fahrzeugname (ID-Präfix) */
  name: string;
  /** Welt-Position des Chassis-Ursprungs beim Spawn */
  origin: { x: number; y: number; z: number };
  chassis: RAPIER.RigidBody;
  /** Statische gefederte Masse je Achse [kg] */
  axleSprungMass: number[];
  /** Body-Handle → ID (Debug/Lookup) */
  names: Map<number, string>;
}

export const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };
