import { BoxGeometry, CylinderGeometry, Group, Mesh, Quaternion, Vector3 } from 'three';
import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { Attach, Corner, LinkVisual } from '../types';
import { MAT } from './materials';

const UP = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _m = new Vector3();

const GEO = {
  rod: new CylinderGeometry(0.022, 0.022, 1, 8),
  beam: new CylinderGeometry(0.04, 0.04, 1, 10),
  spring: new CylinderGeometry(0.065, 0.065, 1, 14, 1, true),
  tube: new CylinderGeometry(0.032, 0.032, 1, 10),
  piston: new CylinderGeometry(0.014, 0.014, 1, 8),
  knuckle: new BoxGeometry(0.07, 0.24, 0.12),
};
const DAMPER_TUBE = 0.2;

function world(at: Attach, out: Vector3): Vector3 {
  const t = at.body.translation();
  const r = at.body.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  return out.set(at.local[0], at.local[1], at.local[2]).applyQuaternion(_q).add(_m.set(t.x, t.y, t.z));
}

function stretch(m: Mesh, a: Vector3, b: Vector3): void {
  _d.subVectors(b, a);
  const l = _d.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, l > 1e-6 ? _d.divideScalar(l) : UP);
  m.scale.set(1, Math.max(l, 1e-4), 1);
}

function mesh(geo: CylinderGeometry | BoxGeometry, mat: Mesh['material']): Mesh {
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/**
 * Generische Darstellung aller Aufhängungs-Teile: jedes LinkVisual = Zylinder zwischen zwei Körperpunkten.
 * Builder beschreiben nur Punkte, nicht die Optik.
 */
export class LinkRenderer {
  readonly root = new Group();
  private items: { v: LinkVisual; meshes: Mesh[] }[] = [];
  private knuckles: { body: RAPIER.RigidBody; mesh: Mesh }[] = [];

  constructor(corners: Corner[]) {
    for (const c of corners) {
      for (const v of c.visuals) {
        const meshes =
          v.kind === 'damper'
            ? [mesh(GEO.tube, MAT.damper), mesh(GEO.piston, MAT.rod)]
            : v.kind === 'spring'
              ? [mesh(GEO.spring, MAT.spring)]
              : v.kind === 'beam'
                ? [mesh(GEO.beam, MAT.frame)]
                : [mesh(GEO.rod, MAT.hub)];
        this.root.add(...meshes);
        this.items.push({ v, meshes });
      }
      const k = mesh(GEO.knuckle, MAT.knuckle);
      this.root.add(k);
      this.knuckles.push({ body: c.knuckle ?? c.carrier, mesh: k });
    }
  }

  sync(): void {
    for (const { v, meshes } of this.items) {
      world(v.a, _a);
      world(v.b, _b);
      if (v.kind === 'damper') {
        _d.subVectors(_b, _a);
        const l = _d.length();
        const tubeEnd = _d.multiplyScalar(Math.min(1, DAMPER_TUBE / (l || 1))).add(_a).clone();
        stretch(meshes[0], _a, tubeEnd);
        stretch(meshes[1], tubeEnd, _b);
      } else {
        stretch(meshes[0], _a, _b);
      }
    }
    for (const { body, mesh: m } of this.knuckles) {
      const t = body.translation();
      const r = body.rotation();
      m.position.set(t.x, t.y, t.z);
      m.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
