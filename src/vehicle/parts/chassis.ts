import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { ChassisSpec } from '../types';
import { CHASSIS_GROUPS } from '../groups';
import { IDENTITY_ROT } from './context';

/** Profil des sichtbaren Leiterrahmens (siehe visual/frameVisual.ts) */
export const FRAME_RAIL = 0.1;

/**
 * Kollisionsform = sichtbarer Leiterrahmen (abgerundete flache Box um die Längsträger).
 * Früher: volle Box `size` → unsichtbar, setzte auf Bodenwellen auf und verhakte an
 * Dreieckskanten („unsichtbare Wand“). Rundung lässt den Rahmen über Kanten gleiten.
 */
export function frameColliderBox(spec: ChassisSpec): { half: [number, number, number]; y: number } {
  const [w, h, l] = spec.size;
  const railX = w * 0.25;
  const y = -h / 2 + FRAME_RAIL / 2 + 0.1;
  return { half: [railX + FRAME_RAIL / 2, FRAME_RAIL / 2 + 0.01, l / 2], y };
}

/** Chassis = gefederte Masse. Masse/Trägheit der vollen Box `size`, Kollision = Rahmen. */
export function createChassis(
  R: typeof RAPIER,
  world: RAPIER.World,
  spec: ChassisSpec,
  pos: { x: number; y: number; z: number },
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
  const { half, y } = frameColliderBox(spec);
  const border = 0.04;
  const desc = R.ColliderDesc.roundCuboid(half[0] - border, half[1] - border, half[2] - border, border)
    .setTranslation(0, y, 0)
    // Schwerpunkt ist im Collider-System anzugeben
    .setMassProperties(m, { x: cx, y: cy - y, z: cz }, inertia, IDENTITY_ROT)
    .setFriction(0.5)
    .setCollisionGroups(CHASSIS_GROUPS);
  world.createCollider(desc, body);
  return body;
}
