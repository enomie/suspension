import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner, VehicleSpec } from '../types';
import type { DriverInput } from '../../../shared/driverInput';
import { bikeBalance, bikeVehicleSpec, type BikeVehicleSpec } from '../../../shared/bikeSpec';
import { topSpeed } from '../../../shared/performance';
import { Steering } from '../parts/steering';
import { applyAirDrag, applyDrive } from '../parts/drive';
import { STEER_DAMPING, STEER_STIFFNESS } from '../parts/suspension/common';
import { updateCornerTelemetry } from '../parts/telemetry';
import { Balance } from './balance';
import { buildBikeVehicle, type BuiltBike } from './buildBike';

const _q = new Quaternion();
const _v = new Vector3();

/**
 * Runtime bike (physics only): driver input → steering with balance assist, rear wheel drive, brakes.
 * The steering input asks for a lean (a turn), not a steer angle; `Balance` turns it into the fork angle.
 */
export class BikeVehicle {
  readonly built: BuiltBike;
  /** the derived wheeled description (fork, swingarm, wheels) the bike was built from */
  readonly wheeled: VehicleSpec;
  /** smooths the steering input */
  readonly steering: Steering;
  readonly balance: Balance;
  /** forward speed [m/s] (+ = chassis −Z) */
  forwardSpeed = 0;
  /** natural top speed [m/s]: reference for the input smoothing */
  private readonly refSpeed: number;
  private readonly front: Corner;
  private readonly maxSteer: number;

  constructor(
    R: typeof RAPIER,
    private world: RAPIER.World,
    readonly spec: BikeVehicleSpec,
    pos: { x: number; y: number; z: number },
  ) {
    this.built = buildBikeVehicle(R, world, spec, pos);
    this.wheeled = bikeVehicleSpec(spec);
    this.refSpeed = topSpeed(this.wheeled);
    this.steering = new Steering(this.wheeled.steering, this.wheeled);
    this.balance = new Balance(bikeBalance(spec), spec.wheelbase);
    this.front = this.built.corners[0];
    this.maxSteer = this.front.axle.steer!.maxAngle;
  }

  get chassis(): RAPIER.RigidBody {
    return this.built.chassis;
  }
  get corners(): Corner[] {
    return this.built.corners;
  }

  /** call before every world.step() */
  applyInput(input: DriverInput, dt: number): void {
    const rot = this.chassis.rotation();
    const lv = this.chassis.linvel();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _v.set(0, 0, -1).applyQuaternion(_q);
    this.forwardSpeed = _v.x * lv.x + _v.y * lv.y + _v.z * lv.z;

    this.steering.update(input.steer, dt, this.forwardSpeed, this.refSpeed / 2);
    const angle = this.balance.update(this.chassis, this.steering.value, this.maxSteer, this.forwardSpeed);
    this.front.telemetry.steerAngle = angle;
    this.front.joints.steer!.configureMotorPosition(angle, STEER_STIFFNESS, STEER_DAMPING);
    applyDrive(this.corners, this.wheeled, input, this.forwardSpeed);
    applyAirDrag(this.chassis, dt, !!input.boost);
  }

  /** after world.step(): refresh telemetry */
  updateTelemetry(): void {
    updateCornerTelemetry(this.chassis, this.corners);
  }

  dispose(): void {
    const bodies = new Set([this.chassis, ...this.corners.flatMap((c) => c.bodies)]);
    for (const b of bodies) this.world.removeRigidBody(b);
  }
}
