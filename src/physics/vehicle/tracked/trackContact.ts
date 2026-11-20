import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';
import type { Corner } from '../types';
import type { TrackedVehicleSpec } from '../../../shared/trackedSpec';
import type { TrackCommand } from '../../../shared/trackDrive';
import { fillTrackProfile, trackProfileRange, TRACK_PROFILE_LENGTH, type ProfileSample } from '../../../shared/trackProfile';
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

/** points on the idler and sprocket arc [rad below horizontal, nose → bottom]: the chain wraps the ends like a ramp */
const END_ARC_ANGLES = [0, Math.PI / 4, Math.PI / 2];

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

interface Anchor {
  /** world position of the chain line end (bottom of the wheel) */
  p: Vector3;
  /** body the force goes to */
  body: RAPIER.RigidBody;
  v: Vector3;
  /** a road wheel collider touches the ground at this end: no contact points right next to it */
  wheel: boolean;
}

const _q = new Quaternion();
const _up = new Vector3();
const _fwd = new Vector3();
const _n = new Vector3();
const _t = new Vector3();
const _f = new Vector3();
const _pa = new Vector3();
const _zAxis = new Vector3();

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
    const cr = this.chassis.rotation();
    _q.set(cr.x, cr.y, cr.z, cr.w);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    this.spanThrust.L = this.spanThrust.R = 0;
    this.profile.fill(0);
    if (!this.enabled) return;
    for (const side of ['L', 'R'] as const) this.applySide(side, cmd[side], driveCap[side], dt);
  }

  private anchors(side: 'L' | 'R'): Anchor[] {
    const spec = this.spec;
    const x = (side === 'L' ? -1 : 1) * (spec.track / 2);
    const ct = this.chassis.translation();
    const lv = this.chassis.linvel();
    const av = this.chassis.angvel();
    const list: Anchor[] = [];
    // point on the chain around an idler / sprocket (chassis-local → world); `a` = angle below the horizontal on the
    // outer side: 0 = at axle height facing away from the vehicle, 90° = bottom
    const endAnchor = (w: { z: number; y: number; radius: number }, outward: number, a: number): Anchor => {
      const r = w.radius + spec.chainThickness;
      const local = new Vector3(x, w.y - r * Math.sin(a), w.z + outward * r * Math.cos(a)).applyQuaternion(_q);
      const v = new Vector3(lv.x + av.y * local.z - av.z * local.y, lv.y + av.z * local.x - av.x * local.z, lv.z + av.x * local.y - av.y * local.x);
      return { p: new Vector3(ct.x + local.x, ct.y + local.y, ct.z + local.z), body: this.chassis, v, wheel: false };
    };
    // the chain wraps the front of the idler: contact ramp from its nose down to its bottom (idler is at −Z, outward = −1)
    for (const a of END_ARC_ANGLES) list.push(endAnchor(spec.idler, -1, a));
    const wheels = this.corners.filter((c) => c.side === side).sort((a, b) => a.anchor[2] - b.anchor[2]);
    for (const c of wheels) {
      const t = c.wheel.translation();
      const v = c.wheel.linvel();
      list.push({ p: new Vector3(t.x, t.y, t.z).addScaledVector(_up, -c.axle.wheel.radius), body: c.wheel, v: new Vector3(v.x, v.y, v.z), wheel: true });
    }
    for (const a of [...END_ARC_ANGLES].reverse()) list.push(endAnchor(spec.sprocket, 1, a));
    return list;
  }

  private applySide(side: 'L' | 'R', cmd: TrackCommand, cap: number, dt: number): void {
    const anchors = this.anchors(side);
    const k = this.meanStiffness * SUPPORT_STIFFNESS_SHARE;
    const c = k * SUPPORT_DAMPING_TIME;
    const filter = groups(GROUP_ALL, GROUP_TERRAIN);
    const samples: ProfileSample[] = [];
    const [z0, z1] = trackProfileRange(this.spec);
    _zAxis.set(0, 0, 1).applyQuaternion(_q);
    const ct = this.chassis.translation();
    const ray = new this.R.Ray({ x: 0, y: 0, z: 0 }, { x: -_up.x, y: -_up.y, z: -_up.z });

    for (let i = 0; i + 1 < anchors.length; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      const len = a.p.distanceTo(b.p);
      const n = Math.max(1, Math.round(len / SAMPLE_SPACING));
      for (let j = 0; j < n; j++) {
        const s = (j + 0.5) / n;
        if ((a.wheel && s * len < WHEEL_CLEARANCE) || (b.wheel && (1 - s) * len < WHEEL_CLEARANCE)) continue;
        _pa.copy(a.p).lerp(b.p, s); // point on the chain line
        ray.origin.x = _pa.x + _up.x * PROBE_LIFT;
        ray.origin.y = _pa.y + _up.y * PROBE_LIFT;
        ray.origin.z = _pa.z + _up.z * PROBE_LIFT;
        const zl = (_pa.x - ct.x) * _zAxis.x + (_pa.y - ct.y) * _zAxis.y + (_pa.z - ct.z) * _zAxis.z; // chassis-local z
        const hit = this.world.castRayAndGetNormal(ray, PROBE_LIFT, true, undefined, filter);
        const pen = hit ? PROBE_LIFT - hit.timeOfImpact : 0;
        const sample: ProfileSample = { z: zl, lift: Math.max(0, pen) };
        samples.push(sample);
        if (!hit || pen <= 0) continue;
        _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
        if (_n.dot(_up) <= 0.05) {
          sample.lift = 0;
          continue;
        } // vertical or overhanging faces: only the wheel colliders deal with those

        // velocity of the chain line point, blended from its two anchors
        const vx = a.v.x + (b.v.x - a.v.x) * s;
        const vy = a.v.y + (b.v.y - a.v.y) * s;
        const vz = a.v.z + (b.v.z - a.v.z) * s;
        const vn = vx * _n.x + vy * _n.y + vz * _n.z;
        const support = Math.max(0, k * pen - c * vn);
        if (support === 0) {
          sample.lift = 0;
          continue;
        }

        // drive direction on the surface: chassis forward projected into the contact plane
        _t.copy(_fwd).addScaledVector(_n, -_fwd.dot(_n));
        if (_t.lengthSq() < 1e-6) {
          sample.lift = 0;
          continue;
        }
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
        this.points.push({
          side,
          point: new Vector3(ray.origin.x, ray.origin.y, ray.origin.z).addScaledVector(_up, -hit.timeOfImpact),
          normal: _n.clone(),
          support,
          traction,
        });
      }
    }
    fillTrackProfile(this.profile, side === 'L' ? 0 : 1, samples, z0, z1);
  }
}
