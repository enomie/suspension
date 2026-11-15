import { Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { VehicleLayout } from '../../shared/vehicleLayout';
import type { CornerTelemetry, VehicleSpec, WheelSpec } from '../../shared/vehicleSpec';
import { ORIGIN } from '../../shared/origin';
import { BODY_STRIDE, CORNER_STRIDE, HEADER, bodyOffset } from '../../shared/snapshot';
import { UNIT_BOX_GEOMETRY, UNIT_CYLINDER_GEOMETRY, UNIT_HOLLOW_CYLINDER_GEOMETRY } from '../geometries/unitGeometries';
import { createFrameVisual } from './frameVisual';
import { LinkRenderer, type BodyPoses } from './linkVisual';

const tireMat = new MeshStandardMaterial({ color: 0x202226, roughness: 0.9 });
const rimMat = new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.4, metalness: 0.3 });

const discMat = new MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.7 });
const DISC_RADIUS = 0.45; // × Reifenradius (Innenradius des Reifens = 0,6)
const DISC_THICKNESS = 0.025; // [m]
const HUB_DIAMETER = 0.12;
const HUB_LENGTH = 0.08;

/**
 * Rad = hohler Reifen (Unit-Hohlzylinder um X) + Bremsscheibe (Unit-Zylinder) + Speiche (macht Drehung sichtbar).
 * Reifen ist ein eigenes Mesh `tire` → später abmontierbar, dann bleibt die Bremsscheibe sichtbar.
 */
function createWheelMesh(spec: WheelSpec): Group {
  const g = new Group();
  const d = spec.radius * 2;
  const tire = new Mesh(UNIT_HOLLOW_CYLINDER_GEOMETRY, tireMat);
  tire.name = 'tire';
  tire.scale.set(d, spec.width, d);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const disc = new Mesh(UNIT_CYLINDER_GEOMETRY, discMat);
  disc.name = 'brakeDisc';
  disc.scale.set(spec.radius * 2 * DISC_RADIUS, DISC_THICKNESS, spec.radius * 2 * DISC_RADIUS);
  disc.rotation.z = Math.PI / 2;
  disc.castShadow = true;
  const spoke = new Mesh(UNIT_BOX_GEOMETRY, rimMat);
  spoke.scale.set(spec.width * 1.02, spec.radius * 0.9, spec.radius * 0.25);
  // Nabe: von knapp außerhalb der Scheibe bis zum Achsschenkel; Seite wird in `placeHubs` gesetzt
  const hub = new Mesh(UNIT_CYLINDER_GEOMETRY, discMat);
  hub.name = 'hub';
  hub.scale.set(HUB_DIAMETER, HUB_LENGTH, HUB_DIAMETER);
  hub.rotation.z = Math.PI / 2;
  hub.castShadow = true;
  g.add(tire, disc, spoke, hub);
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
  private frame: Mesh;
  private links: LinkRenderer;
  private state: Float64Array | null = null;
  private q0: number;
  private inboardPlaced = false;

  constructor(readonly layout: VehicleLayout) {
    this.spec = layout.spec;
    this.corners = layout.corners.map((c) => ({
      id: c.id,
      telemetry: { travel: 0, springForce: 0, wheelOmega: 0, steerAngle: 0 },
    }));
    this.q0 = bodyOffset(layout.corners.length);
    this.root.name = layout.spec.name;
    this.frame = createFrameVisual(layout.spec, layout.mounts);
    this.chassis.add(this.frame);
    this.wheels = layout.corners.map((c) => {
      const w = createWheelMesh(c.wheelSpec);
      w.name = `${c.id}.wheel`;
      return w;
    });
    this.links = new LinkRenderer(layout);
    this.root.add(this.chassis, ...this.wheels, this.links.root);
    this.root.visible = false; // bis der erste Snapshot da ist
  }

  /** Einmalig nach dem ersten Snapshot: Seite jedes Rads (zum Chassis hin = innen) → Nabe + Achsschenkel nach innen */
  private placeInboard(): void {
    const L = this.layout;
    const q = this.rotation(L.chassis, new Quaternion()).invert();
    const c = this.position(L.chassis, new Vector3());
    const signs = L.corners.map((k) => {
      const local = this.position(k.wheel, new Vector3()).sub(c).applyQuaternion(q);
      return local.x > 0 ? -1 : 1;
    });
    signs.forEach((s, i) => this.wheels[i].getObjectByName('hub')!.position.x = s * (HUB_LENGTH / 2 - 0.02));
    this.links.setInboard(signs);
    this.inboardPlaced = true;
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
    if (!this.inboardPlaced) this.placeInboard();
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

  /** Leiterrahmen ein-/ausblenden (Aufhängung und Räder bleiben sichtbar) */
  setFrameVisible(on: boolean): void {
    this.frame.visible = on;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
