import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner, DriverInput, VehicleSpec } from './types';
import { buildVehicle, type BuiltVehicle } from './buildVehicle';
import { Steering } from './parts/steering';
import { applyDrive } from './parts/drive';
import { PoseInterpolator } from './interpolation';

const _q = new Quaternion();
const _qi = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();

/** Laufzeit-Fahrzeug: Input → Motoren, Visual-Sync, Telemetrie. */
export class Vehicle {
  readonly built: BuiltVehicle;
  readonly steering: Steering;
  /** Vorwärtsgeschwindigkeit [m/s] (+ = −Z des Chassis) */
  forwardSpeed = 0;

  constructor(
    R: typeof RAPIER,
    private world: RAPIER.World,
    readonly spec: VehicleSpec,
    pos: { x: number; y: number; z: number },
  ) {
    this.built = buildVehicle(R, world, spec, pos);
    this.steering = new Steering(spec.steering, spec);
    this.poses = new PoseInterpolator([
      ...new Set([this.built.chassis, ...this.built.corners.flatMap((c) => [c.carrier, ...c.bodies])]),
    ]);
  }

  /** Render-Interpolation (vor jedem world.step `poses.capture()`) */
  readonly poses: PoseInterpolator;

  get chassis(): RAPIER.RigidBody {
    return this.built.chassis;
  }
  get corners(): Corner[] {
    return this.built.corners;
  }

  /** Vor jedem world.step() aufrufen. */
  applyInput(input: DriverInput, dt: number): void {
    const rot = this.chassis.rotation();
    const lv = this.chassis.linvel();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _v.set(0, 0, -1).applyQuaternion(_q);
    this.forwardSpeed = _v.x * lv.x + _v.y * lv.y + _v.z * lv.z;

    this.steering.update(input.steer, dt, this.forwardSpeed, this.spec.drive.maxSpeed);
    this.steering.apply(this.corners);
    applyDrive(this.corners, this.spec.drive, input, this.forwardSpeed);
  }

  /** Nach world.step(): Telemetrie aktualisieren. */
  updateTelemetry(): void {
    const ct = this.chassis.translation();
    const cr = this.chassis.rotation();
    _qi.set(cr.x, cr.y, cr.z, cr.w).invert();
    for (const c of this.corners) {
      // Federweg generisch über Radmitte im Chassis-System (+ = ausgefedert)
      const wt = c.wheel.translation();
      _v.set(wt.x - ct.x, wt.y - ct.y, wt.z - ct.z).applyQuaternion(_qi);
      const travel = -(_v.y - c.anchor[1]);
      c.telemetry.travel = travel;
      c.telemetry.springForce = c.stiffness * (c.preload - travel);

      const parent = c.knuckle ?? c.carrier;
      const pr = parent.rotation();
      _q.set(pr.x, pr.y, pr.z, pr.w);
      _w.set(-1, 0, 0).applyQuaternion(_q);
      const wa = c.wheel.angvel();
      const pa = parent.angvel();
      c.telemetry.wheelOmega = _w.x * (wa.x - pa.x) + _w.y * (wa.y - pa.y) + _w.z * (wa.z - pa.z);
    }
  }

  /** Visuals an (interpolierte) Physik angleichen, einmal pro Frame. alpha = Anteil des nächsten Schritts. */
  syncMeshes(alpha = 1): void {
    this.poses.alpha = alpha;
    this.copyPose(this.chassis, this.built.chassisMesh);
    for (const c of this.corners) this.copyPose(c.wheel, c.wheelMesh);
    this.built.links.sync(this.poses);
  }

  private copyPose(body: RAPIER.RigidBody, obj: { position: Vector3; quaternion: Quaternion }): void {
    this.poses.position(body, obj.position);
    this.poses.rotation(body, obj.quaternion);
  }

  dispose(): void {
    const bodies = new Set([this.chassis, ...this.corners.flatMap((c) => c.bodies)]);
    for (const b of bodies) this.world.removeRigidBody(b);
    this.built.root.removeFromParent();
  }
}
