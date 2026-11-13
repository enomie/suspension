import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { VehicleLayout } from '../../shared/vehicleLayout';
import type { CornerTelemetry, VehicleSpec, WheelSpec } from '../../shared/vehicleSpec';
import { ORIGIN } from '../../shared/origin';
import { BODY_STRIDE, CORNER_STRIDE, HEADER, bodyOffset } from '../../shared/snapshot';
import { createFrameVisual } from './frameVisual';
import { LinkRenderer, type BodyPoses } from './linkVisual';

const tireMat = new MeshStandardMaterial({ color: 0x202226, roughness: 0.9 });
const rimMat = new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.4, metalness: 0.3 });

/** Reifen (Zylinder um X) + Speiche (macht Drehung sichtbar). */
function createWheelMesh(spec: WheelSpec): Group {
  const g = new Group();
  const tire = new Mesh(new CylinderGeometry(spec.radius, spec.radius, spec.width, 24), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const spoke = new Mesh(new BoxGeometry(spec.width * 1.02, spec.radius * 1.6, spec.radius * 0.25), rimMat);
  g.add(tire, spoke);
  return g;
}

/**
 * Sichtbares Fahrzeug (Haupt-Thread). Wird allein aus dem Layout des Physik-Workers gebaut –
 * kein Rapier im Haupt-Thread. `apply(snapshot)` setzt alle Meshes aus dem interpolierten Snapshot.
 */
export class VehicleVisual implements BodyPoses {
  readonly root = new Group();
  /** Chassis-Gruppe; ihre Position = Kamera-Fokus */
  readonly chassis = new Group();
  readonly spec: VehicleSpec;
  readonly corners: { id: string; telemetry: CornerTelemetry }[];
  forwardSpeed = 0;
  /** absolute Chassis-Position (HUD) */
  readonly absPos = new Vector3();
  private wheels: Group[];
  private links: LinkRenderer;
  private state: Float64Array | null = null;
  private q0: number;

  constructor(readonly layout: VehicleLayout) {
    this.spec = layout.spec;
    this.corners = layout.corners.map((c) => ({
      id: c.id,
      telemetry: { travel: 0, springForce: 0, wheelOmega: 0, steerAngle: 0 },
    }));
    this.q0 = bodyOffset(layout.corners.length);
    this.root.name = layout.spec.name;
    this.chassis.add(createFrameVisual(layout.spec, layout.mounts));
    this.wheels = layout.corners.map((c) => {
      const w = createWheelMesh(c.wheelSpec);
      w.name = `${c.id}.wheel`;
      return w;
    });
    this.links = new LinkRenderer(layout);
    this.root.add(this.chassis, ...this.wheels, this.links.root);
    this.root.visible = false; // bis der erste Snapshot da ist
  }

  /** Snapshot (absolut) übernehmen und alle Meshes setzen */
  apply(s: Float64Array): void {
    this.state = s;
    this.forwardSpeed = s[2];
    let o = HEADER;
    for (const c of this.corners) {
      const t = c.telemetry;
      t.travel = s[o];
      t.springForce = s[o + 1];
      t.wheelOmega = s[o + 2];
      t.steerAngle = s[o + 3];
      o += CORNER_STRIDE;
    }
    const L = this.layout;
    const co = this.q0 + L.chassis * BODY_STRIDE;
    this.absPos.set(s[co], s[co + 1], s[co + 2]);
    this.position(L.chassis, this.chassis.position);
    this.rotation(L.chassis, this.chassis.quaternion);
    L.corners.forEach((c, i) => {
      this.position(c.wheel, this.wheels[i].position);
      this.rotation(c.wheel, this.wheels[i].quaternion);
    });
    this.links.sync(this);
    this.root.visible = true;
  }

  /** lokal (Render) = absolut − ORIGIN des Haupt-Threads */
  position(body: number, out: Vector3): Vector3 {
    const o = this.q0 + body * BODY_STRIDE;
    const s = this.state!;
    return out.set(s[o] - ORIGIN.x, s[o + 1], s[o + 2] - ORIGIN.z);
  }

  rotation(body: number, out: Quaternion): Quaternion {
    const o = this.q0 + body * BODY_STRIDE;
    const s = this.state!;
    return out.set(s[o + 3], s[o + 4], s[o + 5], s[o + 6]);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
