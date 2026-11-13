import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { WheelSpec } from '../types';
import { WHEEL_GROUPS } from '../groups';

/** Rad = eigener Rigid Body mit Collider (Kugel oder Rund-Zylinder um X). */
export function createWheel(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: WheelSpec,
  pos: { x: number; y: number; z: number },
): RAPIER.RigidBody {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  let desc: RAPIER.ColliderDesc;
  if (spec.shape === 'roundCylinder') {
    const border = Math.min(spec.width * 0.3, spec.radius * 0.3);
    const s = Math.SQRT1_2;
    desc = R.ColliderDesc.roundCylinder(spec.width / 2 - border, spec.radius - border, border)
      .setRotation({ x: 0, y: 0, z: s, w: s });
  } else {
    desc = R.ColliderDesc.ball(spec.radius);
  }
  desc.setMass(spec.mass).setFriction(spec.friction).setCollisionGroups(WHEEL_GROUPS);
  world.createCollider(desc, body);
  return body;
}

const tireMat = new MeshStandardMaterial({ color: 0x202226, roughness: 0.9 });
const rimMat = new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.4, metalness: 0.3 });

/** Reifen (Zylinder um X) + Speiche (macht Drehung sichtbar). */
export function createWheelMesh(spec: WheelSpec): Group {
  const g = new Group();
  const tire = new Mesh(new CylinderGeometry(spec.radius, spec.radius, spec.width, 24), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const spoke = new Mesh(
    new BoxGeometry(spec.width * 1.02, spec.radius * 1.6, spec.radius * 0.25),
    rimMat,
  );
  g.add(tire, spoke);
  return g;
}
