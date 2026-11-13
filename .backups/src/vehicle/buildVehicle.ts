import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Group } from 'three';
import type { Corner, Vec3, VehicleSpec } from './types';
import type { BuildContext } from './parts/context';
import { createChassis } from './parts/chassis';
import { createFrameVisual } from './visual/frameVisual';
import { LinkRenderer } from './visual/linkVisual';
import { createWheelMesh } from './parts/wheel';
import { SUSPENSIONS } from './parts/suspension';
import { axleLoadShares } from './tuning';

export interface BuiltVehicle {
  chassis: RAPIER.RigidBody;
  corners: Corner[];
  /** Chassis-Visual (folgt chassis) */
  chassisMesh: Group;
  /** Wurzel für alle Visuals (zur Szene hinzufügen) */
  root: Group;
  names: Map<number, string>;
  links: LinkRenderer;
}

/** VehicleSpec → Bodies, Joints, Meshes. `pos` = Welt-Position des Chassis-Ursprungs. */
export function buildVehicle(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: VehicleSpec,
  pos: { x: number; y: number; z: number },
): BuiltVehicle {
  const chassis = createChassis(R, world, spec.chassis, pos);
  const names = new Map<number, string>([[chassis.handle, `${spec.name}.chassis`]]);

  const comZ = spec.chassis.comOffset?.[2] ?? 0;
  const shares = axleLoadShares(spec.axles.map((a) => a.z), comZ);
  const ctx: BuildContext = {
    R,
    world,
    name: spec.name,
    origin: pos,
    chassis,
    axleSprungMass: shares.map((s) => s * spec.chassis.mass),
    names,
  };

  const root = new Group();
  root.name = spec.name;
  const corners: Corner[] = [];
  spec.axles.forEach((axle, i) => {
    for (const c of SUSPENSIONS[axle.suspension](ctx, axle, i)) {
      const wheelMesh = createWheelMesh(axle.wheel);
      wheelMesh.name = `${c.id}.wheel`;
      root.add(wheelMesh);
      corners.push({ ...c, wheelMesh });
    }
  });

  // Anlenkpunkte am Chassis → Rahmen-Konsolen
  const mounts: Vec3[] = [];
  for (const c of corners)
    for (const v of c.visuals)
      for (const a of [v.a, v.b]) if (a.body.handle === chassis.handle) mounts.push(a.local);
  const chassisMesh = new Group();
  chassisMesh.add(createFrameVisual(spec, mounts));
  root.add(chassisMesh);

  const links = new LinkRenderer(corners);
  root.add(links.root);

  return { chassis, corners, chassisMesh, root, names, links };
}
