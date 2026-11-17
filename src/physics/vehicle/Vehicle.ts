import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner, DriverInput, VehicleSpec } from './types';
import { buildVehicle, type BuiltVehicle } from './buildVehicle';
import { Steering } from './parts/steering';
import { applyAirDrag, applyDrive } from './parts/drive';
import { Balance } from './parts/balance';
import { topSpeed } from '../../shared/performance';

const _q = new Quaternion();
const _qi = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();

/** runtime vehicle (physics only): input → motors, telemetry. */
export class Vehicle {
  readonly built: BuiltVehicle;
  readonly steering: Steering;
  /** single-track balance assist (motorcycle, moped) */
  readonly balance?: Balance;
  /** forward speed [m/s] (+ = chassis −Z) */
  forwardSpeed = 0;
  /** natural top speed [m/s] (thrust = rolling + drag): reference for the steering lock */
  private readonly refSpeed: number;

  constructor(
    R: typeof RAPIER,
    private world: RAPIER.World,
    readonly spec: VehicleSpec,
    pos: { x: number; y: number; z: number },
  ) {
    this.built = buildVehicle(R, world, spec, pos);
    this.refSpeed = topSpeed(spec);
    this.steering = new Steering(spec.steering, spec);
    if (spec.balance) {
      const zs = spec.axles.map((a) => a.z);
      this.balance = new Balance(spec.balance, Math.max(...zs) - Math.min(...zs) || 1);
    }
  }

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

    // steering was tuned for half of the top speed; beyond that the lock shrinks further (see Steering)
    this.steering.update(input.steer, dt, this.forwardSpeed, this.refSpeed / 2);
    if (this.balance) {
      const maxSteer = this.spec.axles.find((a) => a.steer)?.steer?.maxAngle ?? 0;
      const total = this.balance.update(this.chassis, this.steering.value, maxSteer, this.forwardSpeed);
      this.steering.balanceOffset = total - this.steering.angle;
    }
    this.steering.apply(this.corners);
    applyDrive(this.corners, this.spec, input, this.forwardSpeed);
    applyAirDrag(this.chassis, dt, !!input.boost);
  }

  /** after world.step(): refresh telemetry. */
  updateTelemetry(): void {
    const ct = this.chassis.translation();
    const cr = this.chassis.rotation();
    _qi.set(cr.x, cr.y, cr.z, cr.w).invert();
    for (const c of this.corners) {
      // suspension travel generically via wheel center in chassis space (+ = extended)
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

  dispose(): void {
    const bodies = new Set([this.chassis, ...this.corners.flatMap((c) => c.bodies)]);
    for (const b of bodies) this.world.removeRigidBody(b);
  }
}
