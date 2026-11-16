import { BufferGeometry, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { BodyPoint, VehicleLayout } from '../../shared/vehicleLayout';
import { UNIT_BOX_GEOMETRY, UNIT_CYLINDER_GEOMETRY, UNIT_HELIX_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';

/** body poses (render-local), addressed by snapshot index */
export interface BodyPoses {
  position(body: number, out: Vector3): Vector3;
  rotation(body: number, out: Quaternion): Quaternion;
}

const UP = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _m = new Vector3();
const _t = new Vector3();

/** diameter or box size [m] of parts; length from endpoints */
const SIZE = { rod: 0.044, beam: 0.08, spring: 0.13, tube: 0.064, piston: 0.028 };
const SEAT_DIAMETER = 0.15;
const SEAT_THICKNESS = 0.012;
const KNUCKLE: [number, number, number] = [0.07, 0.24, 0.12];
/** knuckle box offset inboard (knuckle-local X) to sit behind brake disc [m] */
export const KNUCKLE_INBOARD = 0.05;
const DAMPER_TUBE = 0.2;

function world(poses: BodyPoses, at: BodyPoint, out: Vector3): Vector3 {
  poses.rotation(at.body, _q);
  poses.position(at.body, _m);
  return out.set(at.local[0], at.local[1], at.local[2]).applyQuaternion(_q).add(_m);
}

const _p = new Vector3();
const _s = new Vector3();
const _mat = new Matrix4();

/** set instance `i` of `batch` as cylinder/box from `a` to `b` (unit cylinder along Y, length |b−a|, diameter `d`). */
function stretch(batch: InstancedMesh, i: number, a: Vector3, b: Vector3, d: number): void {
  _d.subVectors(b, a);
  const l = _d.length();
  _p.addVectors(a, b).multiplyScalar(0.5);
  _q.setFromUnitVectors(UP, l > 1e-6 ? _d.divideScalar(l) : UP);
  batch.setMatrixAt(i, _mat.compose(_p, _q, _s.set(d, Math.max(l, 1e-4), d)));
}

/** one draw call per (geometry, material); `count` = instance count, `next` = write index while building */
function batch(geo: BufferGeometry, mat: InstancedMesh['material'], count: number): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(count, 1));
  m.count = count;
  m.castShadow = true;
  // bounding sphere not updated (matrices change each frame) → never culled
  m.frustumCulled = false;
  return m;
}

/**
 * generic rendering of all suspension parts: each link = cylinder between two body points.
 * physics only describes points (layout), not visuals.
 *
 * instancing: parts sharing geometry + material use one `InstancedMesh`
 * (not one `Mesh` per part) → ~6 draw calls for whole undercarriage, regardless of link count.
 * each instance group filled once in `sync()` and uploaded via `instanceMatrix.needsUpdate`.
 */
export class LinkRenderer {
  readonly root = new Group();
  /** per link: instance indices in `rod`/`beam`/`spring`/`tube`/`piston` (damper = tube + piston) */
  private items: { v: VehicleLayout['links'][number]; main: InstancedMesh; i: number; piston?: number; kind: 'rod' | 'beam' | 'spring' }[] = [];
  /** `corner` = index in `layout.corners`, `i` = instance index (corners with a hidden knuckle have none) */
  private knuckles: { body: number; wheel: number; i: number; corner: number; inboard: number }[] = [];
  private readonly rods: InstancedMesh;
  private readonly beams: InstancedMesh;
  private readonly springs: InstancedMesh;
  /** spring seats top + bottom (2 instances per spring) */
  private readonly seats: InstancedMesh;
  private readonly tubes: InstancedMesh;
  private readonly pistons: InstancedMesh;
  private readonly knuckleMesh: InstancedMesh;

  constructor(layout: VehicleLayout) {
    const n = (kind: string) => layout.links.filter((v) => v.kind === kind).length;
    const nDamper = n('damper');
    const nSpring = n('spring');
    const nBeam = n('beam');
    const nRod = layout.links.length - nDamper - nSpring - nBeam;
    this.rods = batch(UNIT_CYLINDER_GEOMETRY, MAT.hub, nRod);
    this.beams = batch(UNIT_CYLINDER_GEOMETRY, MAT.frame, nBeam);
    this.springs = batch(UNIT_HELIX_GEOMETRY, MAT.spring, nSpring);
    this.seats = batch(UNIT_CYLINDER_GEOMETRY, MAT.frame, nSpring * 2);
    this.tubes = batch(UNIT_CYLINDER_GEOMETRY, MAT.damper, nDamper);
    this.pistons = batch(UNIT_CYLINDER_GEOMETRY, MAT.rod, nDamper);
    this.knuckleMesh = batch(UNIT_BOX_GEOMETRY, MAT.knuckle, layout.corners.filter((c) => !c.wheelSpec.hideKnuckle).length);

    const used = { rod: 0, beam: 0, spring: 0, damper: 0 };
    for (const v of layout.links) {
      const group = v.kind === 'damper' || v.kind === 'spring' || v.kind === 'beam' ? v.kind : 'rod';
      const main = { damper: this.tubes, spring: this.springs, beam: this.beams, rod: this.rods }[group];
      const i = used[group]++;
      this.items.push({ v, main, i, piston: group === 'damper' ? i : undefined, kind: group === 'damper' ? 'rod' : group });
    }
    // single-track vehicles (`hideKnuckle`): fork slider / swingarm already draw the wheel carrier, no box
    layout.corners.forEach((c, corner) => {
      if (!c.wheelSpec.hideKnuckle) this.knuckles.push({ body: c.knuckle, wheel: c.wheel, i: this.knuckles.length, corner, inboard: 0 });
    });
    this.root.add(this.rods, this.beams, this.springs, this.seats, this.tubes, this.pistons, this.knuckleMesh);
  }

  /** per wheel side: +1 / −1 = toward chassis in wheel-local X (`VehicleVisual` sets once) */
  setInboard(signs: number[]): void {
    for (const k of this.knuckles) k.inboard = signs[k.corner];
  }

  sync(poses: BodyPoses): void {
    for (const { v, main, i, piston, kind } of this.items) {
      world(poses, v.a, _a);
      world(poses, v.b, _b);
      if (piston !== undefined) {
        // damper: short tube at start, piston rod to end
        _d.subVectors(_b, _a);
        const l = _d.length();
        _t.copy(_d).multiplyScalar(Math.min(1, DAMPER_TUBE / (l || 1))).add(_a);
        stretch(main, i, _a, _t, SIZE.tube);
        stretch(this.pistons, piston, _t, _b, SIZE.piston);
      } else {
        stretch(main, i, _a, _b, SIZE[kind]);
        if (main === this.springs) {
          // spring seats at both ends, same orientation as spring (`_q` from `stretch`)
          this.seats.setMatrixAt(2 * i, _mat.compose(_a, _q, _s.set(SEAT_DIAMETER, SEAT_THICKNESS, SEAT_DIAMETER)));
          this.seats.setMatrixAt(2 * i + 1, _mat.compose(_b, _q, _s));
        }
      }
    }
    for (const { body, wheel, i, inboard } of this.knuckles) {
      // position = wheel center, orientation = carrier (bogie: ONE body carries two wheels, origin between them)
      poses.position(wheel, _p);
      poses.rotation(body, _q);
      _p.add(_t.set(inboard * KNUCKLE_INBOARD, 0, 0).applyQuaternion(_q));
      this.knuckleMesh.setMatrixAt(i, _mat.compose(_p, _q, _s.set(...KNUCKLE)));
    }
    for (const m of [this.rods, this.beams, this.springs, this.seats, this.tubes, this.pistons, this.knuckleMesh]) {
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
