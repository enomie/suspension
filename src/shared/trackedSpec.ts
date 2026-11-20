import type { AxleSpec, ChassisSpec, DriveSpec } from './vehicleSpec';

/**
 * Tracked vehicle description (pure, no Rapier/three), like `VehicleSpec` for wheeled vehicles.
 * Forward = −Z, `z` is relative to the chassis origin (−Z = front), `y` is the wheel centre height relative to the
 * chassis origin, as for `AxleSpec`.
 */

/** Idler (front) or sprocket (rear): a wheel fixed to the chassis, with a small collider. It neither moves nor rotates. */
export interface TrackEndWheelSpec {
  /** longitudinal position [m] */
  z: number;
  /** centre height [m], may sit higher or lower than the road wheels (raised idler or sprocket) */
  y: number;
  /** rim radius [m] */
  radius: number;
  /** rim width [m] */
  width: number;
}

export interface TrackedVehicleSpec {
  name: string;
  /** display name (HUD) */
  label?: string;
  chassis: ChassisSpec;
  /**
   * Road axles, index 0 = frontmost, 2…5 of them. Each is a sliding strut pair (`suspension: 'strut'`, `track` > 0, no
   * steering). The wheel collider is as wide as the belt (`beltWidth`) and its radius includes `chainThickness`,
   * so the collider stands for the track; build code derives it, `wheel.width` here is the belt width.
   */
  axles: AxleSpec[];
  /** front wheel, one per side */
  idler: TrackEndWheelSpec;
  /** rear wheel, one per side */
  sprocket: TrackEndWheelSpec;
  /** distance between the centres of the left and right track [m] */
  track: number;
  /** width of one track (chain) [m] */
  beltWidth: number;
  /** thickness of the chain around the wheels [m] */
  chainThickness: number;
  /** name of the standardized chain link asset (`Drive_Chain_Link.json`), scaled across its width to `beltWidth` */
  linkAsset: string;
  drive: DriveSpec;
  /** speed difference of the tracks at full steer [m/s], default `DEFAULT_TURN_SPEED`: higher = tighter turns */
  turnSpeed?: number;
}

/** Value limits of a tracked vehicle [min, max] */
export const TRACKED_LIMITS = {
  axles: [2, 5],
  wheelRadius: [0.2, 0.6],
  endWheelRadius: [0.1, 0.6],
  endWheelWidth: [0.1, 0.5],
  /** end wheel centre height relative to the chassis origin */
  endWheelY: [-0.8, 1.2],
  beltWidth: [0.2, 1],
  chainThickness: [0.01, 0.15],
  turnSpeed: [0.5, 6],
} as const;

const inRange = (v: number, [min, max]: readonly [number, number] | readonly number[]): boolean => v >= min && v <= max;

/**
 * Checks a tracked vehicle description. Returns one message per problem, empty = valid.
 * Rules: 2…5 road axles in front-to-back order, strut suspension without steering, idler in front of and sprocket behind
 * all road wheels, neighbouring wheels of one track do not overlap, left and right track do not overlap, values within `TRACKED_LIMITS`.
 */
export function validateTrackedSpec(spec: TrackedVehicleSpec): string[] {
  const errors: string[] = [];
  const L = TRACKED_LIMITS;
  const { axles, idler, sprocket } = spec;

  if (axles.length < L.axles[0] || axles.length > L.axles[1]) errors.push(`axles: ${axles.length} road axles, need ${L.axles[0]}…${L.axles[1]}`);
  if (!inRange(spec.beltWidth, L.beltWidth)) errors.push(`beltWidth ${spec.beltWidth} outside ${L.beltWidth[0]}…${L.beltWidth[1]}`);
  if (!inRange(spec.chainThickness, L.chainThickness)) errors.push(`chainThickness ${spec.chainThickness} outside ${L.chainThickness[0]}…${L.chainThickness[1]}`);
  if (spec.track < spec.beltWidth) errors.push(`track ${spec.track} is smaller than beltWidth ${spec.beltWidth}: the tracks would overlap`);
  if (spec.turnSpeed !== undefined && !inRange(spec.turnSpeed, L.turnSpeed)) errors.push(`turnSpeed ${spec.turnSpeed} outside ${L.turnSpeed[0]}…${L.turnSpeed[1]}`);
  if (!spec.linkAsset) errors.push('linkAsset is empty');

  axles.forEach((a, i) => {
    if (a.suspension !== 'strut') errors.push(`axle ${i}: suspension must be 'strut', is '${a.suspension}'`);
    if (a.track <= 0) errors.push(`axle ${i}: track must be > 0 (a pair of road wheels)`);
    if (a.steer) errors.push(`axle ${i}: road axles do not steer`);
    if (!inRange(a.wheel.radius, L.wheelRadius)) errors.push(`axle ${i}: wheel radius ${a.wheel.radius} outside ${L.wheelRadius[0]}…${L.wheelRadius[1]}`);
    if (i > 0 && a.z <= axles[i - 1].z) errors.push(`axle ${i}: z must be behind axle ${i - 1} (front to back, −Z = front)`);
    if (i > 0 && a.z - axles[i - 1].z < a.wheel.radius + axles[i - 1].wheel.radius)
      errors.push(`axle ${i}: wheels overlap axle ${i - 1}`);
  });

  for (const [name, w] of [['idler', idler], ['sprocket', sprocket]] as const) {
    if (!inRange(w.radius, L.endWheelRadius)) errors.push(`${name}: radius ${w.radius} outside ${L.endWheelRadius[0]}…${L.endWheelRadius[1]}`);
    if (!inRange(w.width, L.endWheelWidth)) errors.push(`${name}: width ${w.width} outside ${L.endWheelWidth[0]}…${L.endWheelWidth[1]}`);
    if (!inRange(w.y, L.endWheelY)) errors.push(`${name}: y ${w.y} outside ${L.endWheelY[0]}…${L.endWheelY[1]}`);
  }
  if (axles.length > 0) {
    const first = axles[0];
    const last = axles[axles.length - 1];
    if (idler.z + idler.radius > first.z - first.wheel.radius) errors.push('idler must sit in front of the first road wheel without overlapping it');
    if (sprocket.z - sprocket.radius < last.z + last.wheel.radius) errors.push('sprocket must sit behind the last road wheel without overlapping it');
  }
  return errors;
}
