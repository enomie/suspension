import type { Side, Vec3, VehicleSpec, WheelSpec } from './vehicleSpec';
import type { TrackedVehicleSpec } from './trackedSpec';
import type { BikeVehicleSpec } from './bikeSpec';

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
  /**
   * what the renderer draws: the vehicle itself, for a tracked vehicle its chassis and road axles (see `trackedRenderSpec`),
   * for a bike its derived wheeled description (see `bikeVehicleSpec`)
   */
  spec: VehicleSpec;
  /** tracked vehicles only: the full description, for idler, sprocket and chain */
  tracked?: TrackedVehicleSpec;
  /** bikes only: the bike description (fills the bike panel when a bike preset is picked) */
  bike?: BikeVehicleSpec;
  /** number of bodies in snapshot */
  bodyCount: number;
  chassis: number;
  corners: {
    id: string;
    /** index of the axle (0 = frontmost) and side of the vehicle */
    axle: number;
    side: Side;
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
