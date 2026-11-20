import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { ChainLinkAsset } from '../../shared/chainLink';
import { buildChainLoop, linkLayout, type ChainCircle, type ChainPose } from '../../shared/chainLoop';
import { UNIT_BOX_GEOMETRY } from '../geometries/unitGeometries';
import { MAT } from './materials';

export interface ChainVisualOptions {
  asset: ChainLinkAsset;
  /** distance between the centres of the left and right track [m] */
  track: number;
  /** width of one track [m]: the link is scaled across its width to this */
  beltWidth: number;
  chainThickness: number;
  /** wheel circles at design ride (chassis-local, radius of the wheel itself): sets the number of links */
  wheels: readonly ChainCircle[];
}

const _pose: ChainPose = { z: 0, y: 0, angle: 0 };
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _link = new Matrix4();
const _part = new Matrix4();
const _q = new Quaternion();
const _pos = new Vector3();
const _scale = new Vector3();

/**
 * Chain link matrix: link-local Z along the chain's travel direction, Y outward, X across the track
 * (X = Y × Z, which is −X of the chassis: links are symmetric across the track). Chassis-local (x, y, z), pose in the (z, y) plane.
 */
export function linkMatrix(pose: ChainPose, x: number, out: Matrix4): Matrix4 {
  const dz = Math.cos(pose.angle);
  const dy = Math.sin(pose.angle);
  _z.set(0, dy, dz);
  _y.set(0, -dz, dy); // outward = right of the travel direction in the (z, y) plane
  _x.crossVectors(_y, _z);
  return out.makeBasis(_x, _y, _z).setPosition(x, pose.y, pose.z);
}

/**
 * The visible chain of a tracked vehicle: the link asset repeated along the chain loop on both sides.
 * One instanced mesh per part of the link (a few draw calls in total). Add `group` to the chassis group.
 * Every frame: `update(wheels, distance)` with the current wheel circles (the chain follows the suspension) and the
 * distance the track has covered.
 */
export class ChainVisual {
  readonly group = new Group();
  private readonly meshes: InstancedMesh[];
  readonly linkCount: number;
  private readonly xs: [number, number];
  private readonly widthScale: number;
  private readonly asset: ChainLinkAsset;
  private readonly chainThickness: number;

  constructor(o: ChainVisualOptions) {
    this.asset = o.asset;
    this.chainThickness = o.chainThickness;
    this.widthScale = o.beltWidth / o.asset.width;
    this.xs = [-o.track / 2, o.track / 2];
    this.linkCount = linkLayout(buildChainLoop(o.wheels, o.chainThickness).length, o.asset.pitch).count;
    this.group.name = 'chain';
    this.meshes = o.asset.parts.map((_, i) => {
      const m = new InstancedMesh(UNIT_BOX_GEOMETRY, MAT.chain, this.linkCount * 2);
      m.name = `chain.part${i}`;
      m.castShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
  }

  /**
   * @param wheels current wheel circles (chassis-local), same wheels and order as at construction
   * @param distance distance the track surface has moved along the ground [m], forward driving = positive
   */
  update(wheels: readonly ChainCircle[], distance: number): void {
    const loop = buildChainLoop(wheels, this.chainThickness);
    const pitch = loop.length / this.linkCount;
    const k = this.widthScale;
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < this.linkCount; i++) {
        loop.at(distance + i * pitch, _pose);
        linkMatrix(_pose, this.xs[side], _link);
        this.asset.parts.forEach((p, j) => {
          _pos.set(p.position[0] * k, p.position[1], p.position[2]);
          _scale.set(p.size[0] * k, p.size[1], p.size[2]);
          _part.compose(_pos, _q.identity(), _scale);
          this.meshes[j].setMatrixAt(side * this.linkCount + i, _part.premultiply(_link));
        });
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
