import type { Vec3, VehicleSpec, WheelSpec } from './vehicleSpec';

/**
 * what rendering needs about a vehicle — plain data, produced by physics worker
 * (`physics/vehicle/layout.ts`) and sent to main thread. bodies addressed by their
 * snapshot index (order = `poseBodies`).
 */
export interface BodyPoint {
  body: number;
  /** point in body space */
  local: Vec3;
}

export interface VehicleLayout {
  spec: VehicleSpec;
  /** number of bodies in snapshot */
  bodyCount: number;
  chassis: number;
  corners: {
    id: string;
    wheel: number;
    wheelSpec: WheelSpec;
    /** body where knuckle attaches (steer knuckle or wheel carrier) */
    knuckle: number;
  }[];
  links: { kind: 'rod' | 'beam' | 'spring' | 'damper'; a: BodyPoint; b: BodyPoint }[];
  /** Joint markers: spherical = ball, revolute = cylinder along `axis` (body-local) */
  joints: { kind: 'spherical' | 'revolute'; at: BodyPoint; axis: Vec3 }[];
  /** Points where suspension parts are mounted to the chassis (chassis-local) → mount plates */
  mounts: Vec3[];
}
