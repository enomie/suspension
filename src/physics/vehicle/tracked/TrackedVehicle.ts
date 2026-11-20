import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner } from '../types';
import type { DriverInput } from '../../../shared/driverInput';
import type { TrackedVehicleSpec } from '../../../shared/trackedSpec';
import { applyAirDrag } from '../parts/drive';
import { applyTrackDrive } from './applyTrackDrive';
import { TrackContact } from './trackContact';
import { updateCornerTelemetry } from '../parts/telemetry';
import { buildTrackedVehicle, type BuiltTracked } from './buildTracked';

const _q = new Quaternion();
const _v = new Vector3();

/** runtime tracked vehicle (physics only): driver input → track motors. */
export class TrackedVehicle {
  readonly built: BuiltTracked;
  /** forward speed [m/s] (+ = chassis −Z) */
  forwardSpeed = 0;
  /** contact of the chain with the ground between the wheels */
  readonly contact: TrackContact;
  /** chain lift per cell and side, for the snapshot */
  get trackProfile(): Float64Array {
    return this.contact.profile;
  }

  constructor(
    R: typeof RAPIER,
    private world: RAPIER.World,
    readonly spec: TrackedVehicleSpec,
    pos: { x: number; y: number; z: number },
  ) {
    this.built = buildTrackedVehicle(R, world, spec, pos);
    this.contact = new TrackContact(R, world, spec, this.built.chassis, this.built.corners);
  }

  get chassis(): RAPIER.RigidBody {
    return this.built.chassis;
  }
  get corners(): Corner[] {
    return this.built.corners;
  }

  /** Call before every world.step(). */
  applyInput(input: DriverInput, dt: number): void {
    const rot = this.chassis.rotation();
    const lv = this.chassis.linvel();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _v.set(0, 0, -1).applyQuaternion(_q);
    this.forwardSpeed = _v.x * lv.x + _v.y * lv.y + _v.z * lv.z;
    const { cmd, contactCap } = applyTrackDrive(this.corners, this.spec, input, this.forwardSpeed, this.contact.spanThrust);
    this.contact.apply(cmd, contactCap, dt);
    applyAirDrag(this.chassis, dt, !!input.boost);
  }

  /** after world.step(): refresh telemetry. */
  updateTelemetry(): void {
    updateCornerTelemetry(this.chassis, this.corners);
    this.contact.updateProfile();
  }

  dispose(): void {
    const bodies = new Set([this.chassis, ...this.corners.flatMap((c) => c.bodies)]);
    for (const b of bodies) this.world.removeRigidBody(b);
  }
}
