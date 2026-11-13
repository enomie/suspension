import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import { buildVehicle, type BuiltVehicle } from '../vehicle/buildVehicle';
import { poseBodies } from '../vehicle/Vehicle';
import type { PoseSource } from '../vehicle/interpolation';
import type { CornerTelemetry, VehicleSpec } from '../vehicle/types';
import { ORIGIN } from '../world/origin';
import { BODY_STRIDE, CORNER_STRIDE, HEADER, bodyOffset } from './snapshot';

/**
 * Sichtbares Fahrzeug im Haupt-Thread. Aufbau über dieselbe `buildVehicle` in einer leeren,
 * nie gesteppten Rapier-Welt (nur für Struktur + Meshes) → Körper-Reihenfolge identisch zum Worker.
 * Posen kommen aus dem interpolierten Snapshot.
 */
export class VehicleView implements PoseSource {
  readonly built: BuiltVehicle;
  private index = new Map<number, number>();
  private state: Float64Array | null = null;
  private q0: number;
  forwardSpeed = 0;
  /** absolute Chassis-Position (für HUD) */
  readonly absPos = new Vector3();

  constructor(
    R: typeof RAPIER,
    private world: RAPIER.World,
    readonly spec: VehicleSpec,
  ) {
    this.built = buildVehicle(R, world, spec, { x: 0, y: 0, z: 0 });
    poseBodies(this.built).forEach((b, i) => this.index.set(b.handle, i));
    this.q0 = bodyOffset(this.built.corners.length);
  }

  get corners(): { id: string; telemetry: CornerTelemetry }[] {
    return this.built.corners;
  }

  /** Snapshot (absolut) übernehmen und alle Meshes setzen */
  apply(s: Float64Array): void {
    this.state = s;
    this.forwardSpeed = s[2];
    let o = HEADER;
    for (const c of this.built.corners) {
      const t = c.telemetry;
      t.travel = s[o];
      t.springForce = s[o + 1];
      t.wheelOmega = s[o + 2];
      t.steerAngle = s[o + 3];
      o += CORNER_STRIDE;
    }
    this.absPos.set(s[this.q0], s[this.q0 + 1], s[this.q0 + 2]);
    const b = this.built;
    this.position(b.chassis, b.chassisMesh.position);
    this.rotation(b.chassis, b.chassisMesh.quaternion);
    for (const c of b.corners) {
      this.position(c.wheel, c.wheelMesh.position);
      this.rotation(c.wheel, c.wheelMesh.quaternion);
    }
    b.links.sync(this);
  }

  /** lokal (Render) = absolut − ORIGIN des Haupt-Threads */
  position(body: RAPIER.RigidBody, out: Vector3): Vector3 {
    const o = this.q0 + (this.index.get(body.handle) ?? 0) * BODY_STRIDE;
    const s = this.state!;
    return out.set(s[o] - ORIGIN.x, s[o + 1], s[o + 2] - ORIGIN.z);
  }

  rotation(body: RAPIER.RigidBody, out: Quaternion): Quaternion {
    const o = this.q0 + (this.index.get(body.handle) ?? 0) * BODY_STRIDE;
    const s = this.state!;
    return out.set(s[o + 3], s[o + 4], s[o + 5], s[o + 6]);
  }

  dispose(): void {
    this.built.root.removeFromParent();
    const bodies = new Set([this.built.chassis, ...this.built.corners.flatMap((c) => c.bodies)]);
    for (const b of bodies) this.world.removeRigidBody(b);
  }
}
