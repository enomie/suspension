import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { ChassisSpec, ColliderPrimitive } from '../types';
import { CHASSIS_GROUPS } from '../groups';
import { IDENTITY_ROT } from './context';
import { FRAME_RAIL, FRAME_RAIL_X, frameRailY } from '../../../shared/vehicleSpec';

/**
 * collision shape = visible ladder frame (rounded flat box around side rails).
 * Formerly: full box `size` → invisible, landed on ground waves and snagged on
 * triangle edges ("invisible wall"). rounding lets the frame slide over edges.
 */
function frameColliderBox(spec: ChassisSpec, halfLength = spec.size[2] / 2): { half: [number, number, number]; y: number } {
  const h = spec.size[1];
  const y = frameRailY(h);
  return { half: [FRAME_RAIL_X + FRAME_RAIL / 2, FRAME_RAIL / 2 + 0.01, halfLength], y };
}

/** collider primitive → Rapier ColliderDesc (chassis-local) */
function primitiveDesc(R: typeof RAPIER, p: ColliderPrimitive): RAPIER.ColliderDesc {
  const r = p.rounded ?? 0;
  let d: RAPIER.ColliderDesc;
  switch (p.shape) {
    case 'box': {
      const [x, y, z] = p.size ?? [1, 1, 1];
      d = r > 0 ? R.ColliderDesc.roundCuboid(x / 2 - r, y / 2 - r, z / 2 - r, r) : R.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
      break;
    }
    case 'sphere':
      d = R.ColliderDesc.ball(p.radius ?? 0.5);
      break;
    case 'capsule':
      d = R.ColliderDesc.capsule((p.height ?? 1) / 2, p.radius ?? 0.25);
      break;
    case 'cylinder': {
      const h = (p.height ?? 1) / 2;
      const rad = p.radius ?? 0.5;
      d = r > 0 ? R.ColliderDesc.roundCylinder(h - r, rad - r, r) : R.ColliderDesc.cylinder(h, rad);
      break;
    }
  }
  const [x, y, z] = p.position;
  d.setTranslation(x, y, z).setFriction(p.friction ?? 0.5);
  if (p.rotation) d.setRotation({ x: p.rotation[0], y: p.rotation[1], z: p.rotation[2], w: p.rotation[3] });
  return d;
}

/** the `collider-lower` block (spec.lowerCollider): low friction, no mass of its own */
function addLowerCollider(R: typeof RAPIER, world: RAPIER.World, spec: ChassisSpec, body: RAPIER.RigidBody): void {
  const c = spec.lowerCollider;
  if (!c) return;
  const desc = primitiveDesc(R, { shape: 'box', position: c.position, size: c.size, rounded: 0.03, friction: c.friction });
  world.createCollider(desc.setDensity(0).setCollisionGroups(CHASSIS_GROUPS), body);
}

/** chassis = sprung mass. mass/inertia of full box `size`, collision = frame. */
export function createChassis(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: ChassisSpec,
  pos: { x: number; y: number; z: number },
  /** collider length = visible frame (see `frameHalfLength`) */
  frameHalf = spec.size[2] / 2,
): RAPIER.RigidBody {
  const [w, h, l] = spec.size;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setCanSleep(false),
  );
  const m = spec.mass;
  const inertia = {
    x: (m / 12) * (h * h + l * l),
    y: (m / 12) * (w * w + l * l),
    z: (m / 12) * (w * w + h * h),
  };
  const [cx, cy, cz] = spec.comOffset ?? [0, 0, 0];
  if (spec.colliders?.length) {
    // primitives: mass/COM/inertia on body explicitly, colliders without own mass
    body.setAdditionalMassProperties(m, { x: cx, y: cy, z: cz }, inertia, IDENTITY_ROT, true);
    for (const p of spec.colliders) world.createCollider(primitiveDesc(R, p).setDensity(0).setCollisionGroups(CHASSIS_GROUPS), body);
    addLowerCollider(R, world, spec, body);
    return body;
  }
  const { half, y } = frameColliderBox(spec, frameHalf);
  const border = 0.04;
  const desc = R.ColliderDesc.roundCuboid(half[0] - border, half[1] - border, half[2] - border, border)
    .setTranslation(0, y, 0)
    // COM must be specified in collider space
    .setMassProperties(m, { x: cx, y: cy - y, z: cz }, inertia, IDENTITY_ROT)
    .setFriction(0.5)
    .setCollisionGroups(CHASSIS_GROUPS);
  world.createCollider(desc, body);
  addLowerCollider(R, world, spec, body);
  return body;
}
