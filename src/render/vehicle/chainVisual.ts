import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { ChainLinkAsset } from '../../shared/chainLink';
import { buildChainLoop, deformChainLoop, linkLayout, type ChainCircle, type ChainPose } from '../../shared/chainLoop';
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
 * Every frame: `update(left, right, ...)` with the current wheel circles of each side (the chain follows the suspension)
 * and the distance each track has covered.
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
   * @param left current wheel circles of the left track (chassis-local), same wheels and order as at construction
   * @param right same for the right track
   * @param distanceLeft distance the left track surface has moved along the ground [m], forward driving = positive
   * @param distanceRight same for the right track
   */
  update(
    left: readonly ChainCircle[],
    right: readonly ChainCircle[],
    distanceLeft: number,
    distanceRight: number,
    /** optional lift of the lower run per side: `lift(side, z)` [m], chassis-local (ground profile, see `trackProfile.ts`) */
    lift?: (side: 0 | 1, z: number) => number,
  ): void {
    this.updateSide(0, left, distanceLeft, lift);
    this.updateSide(1, right, distanceRight, lift);
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  private updateSide(side: 0 | 1, wheels: readonly ChainCircle[], distance: number, lift?: (side: 0 | 1, z: number) => number): void {
    let loop = buildChainLoop(wheels, this.chainThickness);
    if (lift) {
      // the line through the wheel bottoms (centre line of the chain), from which the ground profile was measured
      const pts = wheels.map((w) => ({ z: w.z, y: w.y - w.radius - this.chainThickness / 2 })).sort((a, b) => a.z - b.z);
      const floor = (z: number): number => {
        if (z < pts[0].z || z > pts[pts.length - 1].z) return -Infinity;
        let i = 0;
        while (i + 2 < pts.length && pts[i + 1].z < z) i++;
        const t = (z - pts[i].z) / Math.max(1e-9, pts[i + 1].z - pts[i].z);
        return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
      };
      loop = deformChainLoop(loop, (z) => lift(side, z), floor);
    }
    const pitch = loop.length / this.linkCount;
    const k = this.widthScale;
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
}
