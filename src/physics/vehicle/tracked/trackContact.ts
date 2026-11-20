import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner } from '../types';
import type { TrackedVehicleSpec } from '../../../shared/trackedSpec';
import type { TrackCommand } from '../../../shared/trackDrive';
import { trackProfileRange, TRACK_PROFILE_CELLS, TRACK_PROFILE_LENGTH } from '../../../shared/trackProfile';
import { lowerRunPath, lowerRunY, samplePath, type PathCircle, type PathPoint } from '../../../shared/trackPath';
import { GROUP_ALL, GROUP_TERRAIN, groups } from '../groups';

/**
 * Track contact between the road wheels.
 *
 * The road wheel colliders carry the track only where the wheels are. Between two wheels the lower run of the chain is
 * a taut line from the bottom of one wheel to the bottom of the next. Where ground or an obstacle (a log) rises above
 * that line, the chain rests on it and carries weight and drive there. This is modelled as contact points along the
 * line: a short ray down from just above the line finds the surface (point, normal, penetration); each contact gives
 *  - a spring-damper force along the surface normal (support), and
 *  - a drive or brake force along the surface (the track runs over it), limited by friction × support.
 * Both forces are applied to the two wheel bodies the point lies between (or to the chassis at idler and sprocket), so
 * the suspension carries the load. No colliders are added; the contacts only query the world.
 *
 * Pure physics, no rendering. Static ground only: no reaction force on the surface.
 */

/** probe origin height above the chain line [m]: must exceed the tallest obstacle to detect */
export const PROBE_LIFT = 0.8;
/** distance between contact points along the lower run [m] */
export const SAMPLE_SPACING = 0.2;
/** no contact points this close to a wheel bottom [m]: the wheel collider already touches there */
export const WHEEL_CLEARANCE = 0.12;
/** support stiffness of one contact point as a share of the road wheel spring rate */
const SUPPORT_STIFFNESS_SHARE = 0.5;
/** support damping time constant [s]: c = k · this */
const SUPPORT_DAMPING_TIME = 0.02;
/** slip speed [m/s] at which the friction force reaches its limit */
const SLIP_FULL_SPEED = 0.4;

/** one contact of the last step, for debugging and tests */
export interface TrackContactPoint {
  side: 'L' | 'R';
  point: Vector3;
  normal: Vector3;
  /** support force [N] */
  support: number;
  /** drive (+) or brake (−) force along the track [N] */
  traction: number;
}

const _q = new Quaternion();
const _up = new Vector3();
const _fwd = new Vector3();
const _n = new Vector3();
const _t = new Vector3();
const _f = new Vector3();
const _pa = new Vector3();
const _pb = new Vector3();
const _qi = new Quaternion();

/**
 * Does a surface hit by a probe carry the chain? Its normal must face the chain (chassis up) and face up in the world.
 * Rapier returns the normal of a ray hit turned toward the ray origin, so a vehicle upside down would find the ground
 * from underneath with a normal that points to the chain: only the world-up test rejects that back face.
 */
function supports(normal: { x: number; y: number; z: number }, up: Vector3): boolean {
  return normal.y > 0.05 && normal.x * up.x + normal.y * up.y + normal.z * up.z > 0.05;
}

export class TrackContact {
  /** contacts of the last `apply`, both sides */
  /** false = only the road wheel colliders touch the ground (for comparison and tests) */
  enabled = true;
  readonly points: TrackContactPoint[] = [];
  /** how far the ground lifts the chain per cell and side (`shared/trackProfile.ts`) */
  readonly profile = new Float64Array(TRACK_PROFILE_LENGTH);
  /** traction force delivered by the span contacts last step, per side [N, along the drive direction] */
  readonly spanThrust = { L: 0, R: 0 };
  private readonly meanStiffness: number;
  private readonly friction: number;

  constructor(
    private R: typeof RAPIER,
    private world: RAPIER.World,
    private spec: TrackedVehicleSpec,
    private chassis: RAPIER.RigidBody,
    private corners: Corner[],
  ) {
    this.meanStiffness = corners.reduce((s, c) => s + c.stiffness, 0) / Math.max(1, corners.length);
    this.friction = corners.reduce((s, c) => s + c.axle.wheel.friction, 0) / Math.max(1, corners.length);
  }

  /**
   * Apply contact forces for one physics step.
   * @param cmd command of each track (speed along the track, + = forward)
   * @param driveCap largest traction one contact point may deliver per side [N] (drive or brake)
   */
  apply(cmd: { L: TrackCommand; R: TrackCommand }, driveCap: { L: number; R: number }, dt: number): void {
    this.points.length = 0;
    this.frame();
    this.spanThrust.L = this.spanThrust.R = 0;
    if (!this.enabled) return;
    for (const side of ['L', 'R'] as const) this.applySide(side, cmd[side], driveCap[side], dt);
  }

  /** chassis axes in world space */
  private frame(): void {
    const cr = this.chassis.rotation();
    _q.set(cr.x, cr.y, cr.z, cr.w);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
  }

  /**
   * Ground profile for the chain visual (`shared/trackProfile.ts`): once per tick, after the step. For every grid cell a
   * ray from above the lower run of the chain down to the surface: lift = height of the surface above the path (0 = free).
   * Taken straight from the world, so it follows the real surface, whatever the spacing of the contact points.
   */
  updateProfile(): void {
    this.profile.fill(0);
    if (!this.enabled) return;
    this.frame();
    const [z0, z1] = trackProfileRange(this.spec);
    const filter = groups(GROUP_ALL, GROUP_TERRAIN);
    const ray = new this.R.Ray({ x: 0, y: 0, z: 0 }, { x: -_up.x, y: -_up.y, z: -_up.z });
    (['L', 'R'] as const).forEach((side, si) => {
      const path = this.path(side);
      for (let i = 0; i < TRACK_PROFILE_CELLS; i++) {
        const z = z0 + ((i + 0.5) / TRACK_PROFILE_CELLS) * (z1 - z0);
        const y = lowerRunY(path, z);
        if (y === -Infinity) continue;
        this.toWorld(side, z, y, _pa);
        ray.origin.x = _pa.x + _up.x * PROBE_LIFT;
        ray.origin.y = _pa.y + _up.y * PROBE_LIFT;
        ray.origin.z = _pa.z + _up.z * PROBE_LIFT;
        const hit = this.world.castRayAndGetNormal(ray, PROBE_LIFT, true, undefined, filter);
        // a probe that starts inside a solid (toi 0) has no usable surface: leave the chain alone
        if (!hit || hit.timeOfImpact <= 1e-6) continue;
        if (!supports(hit.normal, _up)) continue;
        this.profile[si * TRACK_PROFILE_CELLS + i] = Math.max(0, PROBE_LIFT - hit.timeOfImpact);
      }
    });
  }

  /** chassis-local (z, y) on a track → world */
  private toWorld(side: 'L' | 'R', z: number, y: number, out: Vector3): Vector3 {
    const ct = this.chassis.translation();
    out.set((side === 'L' ? -1 : 1) * (this.spec.track / 2), y, z).applyQuaternion(_q);
    return out.set(out.x + ct.x, out.y + ct.y, out.z + ct.z);
  }

  /**
   * Lower run of one track in chassis-local (z, y): the chain under idler, road wheels (current positions, outer radius
   * incl. the chain) and sprocket (`shared/trackPath.ts`).
   */
  private path(side: 'L' | 'R'): PathPoint[] {
    const spec = this.spec;
    const ct = this.chassis.translation();
    const cr = this.chassis.rotation();
    _qi.set(cr.x, cr.y, cr.z, cr.w).invert();
    const circles: PathCircle[] = [{ z: spec.idler.z, y: spec.idler.y, radius: spec.idler.radius + spec.chainThickness }];
    const wheels = this.corners.filter((c) => c.side === side).sort((a, b) => a.anchor[2] - b.anchor[2]);
    for (const c of wheels) {
      const t = c.wheel.translation();
      _pb.set(t.x - ct.x, t.y - ct.y, t.z - ct.z).applyQuaternion(_qi);
      circles.push({ z: _pb.z, y: _pb.y, radius: c.axle.wheel.radius });
    }
    circles.push({ z: spec.sprocket.z, y: spec.sprocket.y, radius: spec.sprocket.radius + spec.chainThickness });
    return lowerRunPath(circles);
  }

  private applySide(side: 'L' | 'R', cmd: TrackCommand, cap: number, dt: number): void {
    const k = this.meanStiffness * SUPPORT_STIFFNESS_SHARE;
    const c = k * SUPPORT_DAMPING_TIME;
    const filter = groups(GROUP_ALL, GROUP_TERRAIN);
    const ray = new this.R.Ray({ x: 0, y: 0, z: 0 }, { x: -_up.x, y: -_up.y, z: -_up.z });
    const ct = this.chassis.translation();
    const lv = this.chassis.linvel();
    const av = this.chassis.angvel();

    for (const sample of samplePath(this.path(side), SAMPLE_SPACING, WHEEL_CLEARANCE)) {
      if (sample.atWheel) continue; // the wheel collider touches there
      this.toWorld(side, sample.z, sample.y, _pa); // point on the chain
      ray.origin.x = _pa.x + _up.x * PROBE_LIFT;
      ray.origin.y = _pa.y + _up.y * PROBE_LIFT;
      ray.origin.z = _pa.z + _up.z * PROBE_LIFT;
      const hit = this.world.castRayAndGetNormal(ray, PROBE_LIFT, true, undefined, filter);
      if (!hit) continue;
      const pen = PROBE_LIFT - hit.timeOfImpact;
      if (pen <= 0) continue;
      _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      if (!supports(hit.normal, _up)) continue; // vertical, overhanging or back faces: only the wheel colliders deal with those

      // velocity of the chain point: the chassis moves it (the wheels hang on the chassis)
      const rx = _pa.x - ct.x;
      const ry = _pa.y - ct.y;
      const rz = _pa.z - ct.z;
      const vx = lv.x + av.y * rz - av.z * ry;
      const vy = lv.y + av.z * rx - av.x * rz;
      const vz = lv.z + av.x * ry - av.y * rx;
      const vn = vx * _n.x + vy * _n.y + vz * _n.z;
      const support = Math.max(0, k * pen - c * vn);
      if (support === 0) continue;

      // drive direction on the surface: chassis forward projected into the contact plane
      _t.copy(_fwd).addScaledVector(_n, -_fwd.dot(_n));
      if (_t.lengthSq() < 1e-6) continue;
      _t.normalize();
      const vt = vx * _t.x + vy * _t.y + vz * _t.z;
      const slip = Math.max(-1, Math.min(1, (cmd.speed - vt) / SLIP_FULL_SPEED));
      const limit = Math.min(this.friction * support, cap);
      const traction = slip * limit;

      _f.copy(_n).multiplyScalar(support).addScaledVector(_t, traction);
      // on the chassis at the contact point: the light wheel bodies would be thrown around by these forces
      const px = ray.origin.x - _up.x * hit.timeOfImpact;
      const py = ray.origin.y - _up.y * hit.timeOfImpact;
      const pz = ray.origin.z - _up.z * hit.timeOfImpact;
      this.chassis.applyImpulseAtPoint({ x: _f.x * dt, y: _f.y * dt, z: _f.z * dt }, { x: px, y: py, z: pz }, true);

      this.spanThrust[side] += cmd.mode === 'drive' ? Math.max(0, traction) : 0;
      this.points.push({ side, point: new Vector3(px, py, pz), normal: _n.clone(), support, traction });
    }
  }
}
