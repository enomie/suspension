import { BufferGeometry, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { BodyPoint, VehicleLayout } from '../../shared/vehicleLayout';
import { UNIT_BOX_GEOMETRY, UNIT_CYLINDER_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';

/** Posen der Körper (Render-lokal), adressiert über den Snapshot-Index */
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

/** Durchmesser bzw. Boxmaße [m] der Teile; Länge kommt aus den Endpunkten */
const SIZE = { rod: 0.044, beam: 0.08, spring: 0.13, tube: 0.064, piston: 0.028 };
const KNUCKLE: [number, number, number] = [0.07, 0.24, 0.12];
const DAMPER_TUBE = 0.2;

function world(poses: BodyPoses, at: BodyPoint, out: Vector3): Vector3 {
  poses.rotation(at.body, _q);
  poses.position(at.body, _m);
  return out.set(at.local[0], at.local[1], at.local[2]).applyQuaternion(_q).add(_m);
}

const _p = new Vector3();
const _s = new Vector3();
const _mat = new Matrix4();

/** Instanz `i` von `batch` als Zylinder/Box von `a` nach `b` setzen (Unit-Zylinder entlang Y, Länge |b−a|, Durchmesser `d`). */
function stretch(batch: InstancedMesh, i: number, a: Vector3, b: Vector3, d: number): void {
  _d.subVectors(b, a);
  const l = _d.length();
  _p.addVectors(a, b).multiplyScalar(0.5);
  _q.setFromUnitVectors(UP, l > 1e-6 ? _d.divideScalar(l) : UP);
  batch.setMatrixAt(i, _mat.compose(_p, _q, _s.set(d, Math.max(l, 1e-4), d)));
}

/** Ein Draw Call pro (Geometrie, Material); `count` = Anzahl Instanzen, `next` = Schreib-Index beim Aufbau */
function batch(geo: BufferGeometry, mat: InstancedMesh['material'], count: number): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(count, 1));
  m.count = count;
  m.castShadow = true;
  // Bounding-Sphere wird nicht nachgeführt (Matrizen ändern sich pro Frame) → nie wegculled
  m.frustumCulled = false;
  return m;
}

/**
 * Generische Darstellung aller Aufhängungs-Teile: jedes Link = Zylinder zwischen zwei Körperpunkten.
 * Die Physik beschreibt nur Punkte (Layout), nicht die Optik.
 *
 * Instancing: alle Teile gleicher Geometrie + Material teilen sich ein `InstancedMesh`
 * (statt je Teil ein `Mesh`) → ~6 Draw Calls für das ganze Fahrgestell, unabhängig von der Anzahl der Links.
 * Jede Instanz-Gruppe wird in `sync()` einmal befüllt und per `instanceMatrix.needsUpdate` hochgeladen.
 */
export class LinkRenderer {
  readonly root = new Group();
  /** Je Link: Instanz-Indizes in `rod`/`beam`/`spring`/`tube`/`piston` (Damper = tube + piston) */
  private items: { v: VehicleLayout['links'][number]; main: InstancedMesh; i: number; piston?: number; kind: 'rod' | 'beam' | 'spring' }[] = [];
  private knuckles: { body: number; i: number }[] = [];
  private readonly rods: InstancedMesh;
  private readonly beams: InstancedMesh;
  private readonly springs: InstancedMesh;
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
    this.springs = batch(UNIT_CYLINDER_GEOMETRY, MAT.spring, nSpring);
    this.tubes = batch(UNIT_CYLINDER_GEOMETRY, MAT.damper, nDamper);
    this.pistons = batch(UNIT_CYLINDER_GEOMETRY, MAT.rod, nDamper);
    this.knuckleMesh = batch(UNIT_BOX_GEOMETRY, MAT.knuckle, layout.corners.length);

    const used = { rod: 0, beam: 0, spring: 0, damper: 0 };
    for (const v of layout.links) {
      const group = v.kind === 'damper' || v.kind === 'spring' || v.kind === 'beam' ? v.kind : 'rod';
      const main = { damper: this.tubes, spring: this.springs, beam: this.beams, rod: this.rods }[group];
      const i = used[group]++;
      this.items.push({ v, main, i, piston: group === 'damper' ? i : undefined, kind: group === 'damper' ? 'rod' : group });
    }
    layout.corners.forEach((c, i) => this.knuckles.push({ body: c.knuckle, i }));
    this.root.add(this.rods, this.beams, this.springs, this.tubes, this.pistons, this.knuckleMesh);
  }

  sync(poses: BodyPoses): void {
    for (const { v, main, i, piston, kind } of this.items) {
      world(poses, v.a, _a);
      world(poses, v.b, _b);
      if (piston !== undefined) {
        // Damper: kurzes Rohr am Anfang, Kolbenstange bis zum Ende
        _d.subVectors(_b, _a);
        const l = _d.length();
        _t.copy(_d).multiplyScalar(Math.min(1, DAMPER_TUBE / (l || 1))).add(_a);
        stretch(main, i, _a, _t, SIZE.tube);
        stretch(this.pistons, piston, _t, _b, SIZE.piston);
      } else {
        stretch(main, i, _a, _b, SIZE[kind]);
      }
    }
    for (const { body, i } of this.knuckles) {
      poses.position(body, _p);
      poses.rotation(body, _q);
      this.knuckleMesh.setMatrixAt(i, _mat.compose(_p, _q, _s.set(...KNUCKLE)));
    }
    for (const m of [this.rods, this.beams, this.springs, this.tubes, this.pistons, this.knuckleMesh]) {
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
