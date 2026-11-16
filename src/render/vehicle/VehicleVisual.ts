import { Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { VehicleLayout } from '../../shared/vehicleLayout';
import type { CornerTelemetry, VehicleSpec, WheelSpec } from '../../shared/vehicleSpec';
import { ORIGIN } from '../../shared/origin';
import { BODY_STRIDE, CORNER_STRIDE, HEADER, bodyOffset } from '../../shared/snapshot';
import { UNIT_BOX_GEOMETRY, UNIT_CYLINDER_GEOMETRY, UNIT_HOLLOW_CYLINDER_GEOMETRY, UNIT_HOLLOW_INNER_RATIO } from '../geometries/unitGeometries';
import { createTreadTireGeometry } from './treadTire';
import { createFrameVisual } from './frameVisual';
import { LinkRenderer, type BodyPoses } from './linkVisual';
import { createMountPlates } from './mountVisual';
import { JointRenderer } from './jointVisual';

const tireMat = new MeshStandardMaterial({ color: 0x202226, roughness: 0.9 });
const rimMat = new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.4, metalness: 0.3 });

const discMat = new MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.7 });
const DISC_RADIUS = 0.45; // × tire radius (tire inner radius = 0.6)
const DISC_THICKNESS = 0.025; // [m]
const SPOKE_WIDTH = 0.03; // rim placeholder: narrow, outside brake disc
const HUB_DIAMETER = 0.12;
const HUB_LENGTH = 0.08;

/**
 * wheel = hollow tire (unit hollow cylinder on X) + brake disc (unit cylinder) + spoke (shows spin).
 * tire is its own `tire` mesh → detachable later, brake disc stays visible.
 */
function createWheelMesh(spec: WheelSpec): Group {
  const g = new Group();
  const d = spec.radius * 2;
  const tire =
    spec.tire === 'tread'
      ? new Mesh(createTreadTireGeometry(spec), tireMat)
      : new Mesh(UNIT_HOLLOW_CYLINDER_GEOMETRY, tireMat);
  tire.name = 'tire';
  if (spec.tire !== 'tread') {
    tire.scale.set(d, spec.width, d);
    tire.rotation.z = Math.PI / 2;
  }
  tire.castShadow = true;
  const disc = new Mesh(UNIT_CYLINDER_GEOMETRY, discMat);
  disc.name = 'brakeDisc';
  disc.scale.set(spec.radius * 2 * DISC_RADIUS, DISC_THICKNESS, spec.radius * 2 * DISC_RADIUS);
  disc.rotation.z = Math.PI / 2;
  disc.castShadow = true;
  const spoke = new Mesh(UNIT_BOX_GEOMETRY, rimMat);
  spoke.name = 'spoke';
  // length = tire hole diameter (inner radius = ratio × outer radius)
  spoke.scale.set(SPOKE_WIDTH, spec.radius * 2 * UNIT_HOLLOW_INNER_RATIO, spec.radius * 0.25);
  // hub: just outside disc to knuckle; side set in `placeHubs`
  const hub = new Mesh(UNIT_CYLINDER_GEOMETRY, discMat);
  hub.name = 'hub';
  hub.scale.set(HUB_DIAMETER, HUB_LENGTH, HUB_DIAMETER);
  hub.rotation.z = Math.PI / 2;
  hub.castShadow = true;
  g.add(tire, disc, spoke, hub);
  return g;
}

/**
 * visible vehicle (main thread). built only from physics worker layout —
 * no Rapier on main thread. `apply(snapshot)` sets all meshes from interpolated snapshot.
 */
export class VehicleVisual implements BodyPoses {
  readonly root = new Group();
  /** chassis group; its position = camera focus */
  readonly chassis = new Group();
  readonly spec: VehicleSpec;
  readonly corners: { id: string; telemetry: CornerTelemetry }[];
  forwardSpeed = 0;
  /** absolute chassis position (HUD) */
  readonly absPos = new Vector3();
  private wheels: Group[];
  private frame: Mesh;
  private links: LinkRenderer;
  private joints: JointRenderer;
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
    this.frame = createFrameVisual(layout.spec);
    this.frame.visible = layout.spec.chassis.frame !== false;
    this.chassis.add(this.frame, createMountPlates(layout.mounts));
    this.wheels = layout.corners.map((c) => {
      const w = createWheelMesh(c.wheelSpec);
      w.name = `${c.id}.wheel`;
      return w;
    });
    this.links = new LinkRenderer(layout);
    this.joints = new JointRenderer(layout);
    this.root.add(this.chassis, ...this.wheels, this.links.root, this.joints.root);
    this.root.visible = false; // until first snapshot arrives
  }

  /** once after first snapshot: each wheel side (toward chassis = inboard) → hub + knuckle inboard */
  private placeInboard(): void {
    const L = this.layout;
    const q = this.rotation(L.chassis, new Quaternion()).invert();
    const c = this.position(L.chassis, new Vector3());
    const signs = L.corners.map((k) => {
      const local = this.position(k.wheel, new Vector3()).sub(c).applyQuaternion(q);
      return local.x > 0 ? -1 : 1;
    });
    signs.forEach((s, i) => this.wheels[i].getObjectByName('hub')!.position.x = s * (HUB_LENGTH / 2 - 0.02));
    signs.forEach((s, i) => (this.wheels[i].getObjectByName('spoke')!.position.x = -s * (DISC_THICKNESS / 2 + SPOKE_WIDTH / 2 + 0.005)));
    this.links.setInboard(signs);
    this.inboardPlaced = true;
  }

  /** apply snapshot (absolute) and set all meshes */
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
    this.joints.sync(this);
    this.root.visible = true;
  }

  /** local (render) = absolute − main-thread ORIGIN */
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

  /** show/hide ladder frame (suspension and wheels stay visible) */
  setFrameVisible(on: boolean): void {
    this.frame.visible = on && this.spec.chassis.frame !== false;
  }

  /** Show or hide the joint markers (balls and hinge cylinders) */
  setJointsVisible(on: boolean): void {
    this.joints.root.visible = on;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
