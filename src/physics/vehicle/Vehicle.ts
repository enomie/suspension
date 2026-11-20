import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner, VehicleSpec } from './types';
import type { DriverInput } from '../../shared/driverInput';
import { buildVehicle, type BuiltVehicle } from './buildVehicle';
import { Steering } from './parts/steering';
import { applyAirDrag, applyDrive } from './parts/drive';
import { Differentials } from './parts/differential';
import { Balance } from './parts/balance';
import { topSpeed } from '../../shared/performance';
import { updateCornerTelemetry } from './parts/telemetry';

const _q = new Quaternion();
const _v = new Vector3();

/** runtime vehicle (physics only): input → motors, telemetry. */
export class Vehicle {
  readonly built: BuiltVehicle;
  readonly steering: Steering;
  /** shafts between the wheels of driven axles without a differential, or while the lock is on */
  readonly differentials: Differentials;
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
    this.differentials = new Differentials(R, world, this.built.corners, spec.drive.maxTorque);
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
    this.differentials.update(input.diffLock ?? 0);
    applyDrive(this.corners, this.spec, input, this.forwardSpeed);
    applyAirDrag(this.chassis, dt, !!input.boost);
  }

  /** after world.step(): refresh telemetry. */
  updateTelemetry(): void {
    updateCornerTelemetry(this.chassis, this.corners);
  }

  dispose(): void {
    const bodies = new Set([this.chassis, ...this.corners.flatMap((c) => c.bodies)]);
    for (const b of bodies) this.world.removeRigidBody(b);
  }
}
