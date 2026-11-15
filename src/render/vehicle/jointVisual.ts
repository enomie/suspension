import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { VehicleLayout } from '../../shared/vehicleLayout';
import { UNIT_CYLINDER_GEOMETRY, UNIT_SPHERE_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';
import type { BodyPoses } from './linkVisual';

const BALL_DIAMETER = 0.08; // [m]
const HINGE_DIAMETER = 0.07; // [m]
const HINGE_LENGTH = 0.16; // [m] along the hinge axis

const UP = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _axisQ = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _axis = new Vector3();
const _mat = new Matrix4();

/**
 * Joint markers: a ball for every spherical joint, a cylinder along the axis for every revolute joint.
 * Two InstancedMeshes (one draw call each). The layout only holds points and axes, never meshes.
 */
export class JointRenderer {
  readonly root = new Group();
  private balls: { body: number; local: [number, number, number]; i: number }[] = [];
  private hinges: { body: number; local: [number, number, number]; axisQ: Quaternion; i: number }[] = [];
  private readonly ballMesh: InstancedMesh;
  private readonly hingeMesh: InstancedMesh;

  constructor(layout: VehicleLayout) {
    for (const j of layout.joints) {
      if (j.kind === 'spherical') {
        this.balls.push({ body: j.at.body, local: j.at.local, i: this.balls.length });
      } else {
        _axis.set(j.axis[0], j.axis[1], j.axis[2]).normalize();
        const axisQ = new Quaternion().setFromUnitVectors(UP, _axis);
        this.hinges.push({ body: j.at.body, local: j.at.local, axisQ, i: this.hinges.length });
      }
    }
    this.ballMesh = this.instanced(UNIT_SPHERE_GEOMETRY, MAT.jointBall, this.balls.length);
    this.hingeMesh = this.instanced(UNIT_CYLINDER_GEOMETRY, MAT.jointHinge, this.hinges.length);
    this.root.add(this.ballMesh, this.hingeMesh);
  }

  private instanced(geo: InstancedMesh['geometry'], mat: InstancedMesh['material'], count: number): InstancedMesh {
    const m = new InstancedMesh(geo, mat, Math.max(count, 1));
    m.count = count;
    m.castShadow = true;
    m.frustumCulled = false; // matrices change every frame, bounding sphere is not maintained
    return m;
  }

  sync(poses: BodyPoses): void {
    for (const b of this.balls) {
      this.place(poses, b.body, b.local, null);
      this.ballMesh.setMatrixAt(b.i, _mat.compose(_p, _q, _s.set(BALL_DIAMETER, BALL_DIAMETER, BALL_DIAMETER)));
    }
    for (const h of this.hinges) {
      this.place(poses, h.body, h.local, h.axisQ);
      this.hingeMesh.setMatrixAt(h.i, _mat.compose(_p, _q, _s.set(HINGE_DIAMETER, HINGE_LENGTH, HINGE_DIAMETER)));
    }
    this.ballMesh.instanceMatrix.needsUpdate = true;
    this.hingeMesh.instanceMatrix.needsUpdate = true;
  }

  /** Writes the world position to `_p` and body rotation (times axis rotation for hinges) to `_q` */
  private place(poses: BodyPoses, body: number, local: [number, number, number], axisQ: Quaternion | null): void {
    poses.rotation(body, _q);
    poses.position(body, _p);
    _p.add(_axis.set(local[0], local[1], local[2]).applyQuaternion(_q));
    if (axisQ) _q.multiply(_axisQ.copy(axisQ));
  }
}
