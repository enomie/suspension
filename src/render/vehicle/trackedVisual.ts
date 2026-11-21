import { trackLiftAt, trackProfileRange } from '../../shared/trackProfile';
import { Group, Mesh, Quaternion, Vector3 } from 'three';
import { CHAIN_LINK, type ChainLinkAsset } from '../../shared/chainLink';
import type { ChainCircle } from '../../shared/chainLoop';
import type { TrackedVehicleSpec } from '../../shared/trackedSpec';
import { designChainWheels } from '../../shared/trackedSpec';
import type { VehicleLayout } from '../../shared/vehicleLayout';
import { UNIT_HOLLOW_CYLINDER_GEOMETRY } from '../geometries/unitGeometries';
import { ChainVisual } from './chainVisual';
import { MAT } from './materials';
import type { BodyPoses } from './linkVisual';

/** longest gap between two snapshots that still counts as continuous motion [s] */
const MAX_STEP = 0.25;

const _c = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();

/**
 * The tracked part of a tracked vehicle: idler and sprocket (fixed on the chassis) and the chain around all wheels.
 * Everything is chassis-local: add `group` to the chassis group.
 * The chain follows the road wheels (suspension), and each track moves at the speed its wheels turn.
 */
export class TrackedVisual {
  readonly group = new Group();
  private readonly chain: ChainVisual;
  private readonly idler: ChainCircle;
  private readonly sprocket: ChainCircle;
  /** per side, road wheel corners (index into the layout) front to back, with their contact radius */
  private readonly sides: { corner: number; radius: number }[][];
  /** idler and sprocket pivots per side (spin about X with the chain) and their chain radius */
  private readonly spinners: { pivot: Group; side: number; radius: number }[] = [];
  private readonly range: [number, number];
  private distance: [number, number] = [0, 0];
  private lastStamp = NaN;
  private readonly left: ChainCircle[];
  private readonly right: ChainCircle[];

  constructor(layout: VehicleLayout, asset: ChainLinkAsset = CHAIN_LINK) {
    const t = layout.tracked as TrackedVehicleSpec;
    this.range = trackProfileRange(t);
    this.idler = { z: t.idler.z, y: t.idler.y, radius: t.idler.radius };
    this.sprocket = { z: t.sprocket.z, y: t.sprocket.y, radius: t.sprocket.radius };
    for (const [w, name] of [[t.idler, 'idler'], [t.sprocket, 'sprocket']] as const) {
      [-t.track / 2, t.track / 2].forEach((x, side) => {
        const m = new Mesh(UNIT_HOLLOW_CYLINDER_GEOMETRY, MAT.knuckle);
        m.name = name;
        m.scale.set(w.radius * 2, w.width, w.radius * 2);
        m.rotation.z = Math.PI / 2;
        m.castShadow = true;
        const pivot = new Group();
        pivot.position.set(x, w.y, w.z);
        pivot.add(m);
        this.group.add(pivot);
        this.spinners.push({ pivot, side, radius: w.radius + t.chainThickness });
      });
    }
    this.sides = [0, 1].map((s) =>
      layout.corners
        .map((c, corner) => ({ c, corner }))
        .filter(({ c }) => c.side === (s === 0 ? 'L' : 'R'))
        .map(({ c, corner }) => ({ corner, radius: c.wheelSpec.radius + t.chainThickness })),
    );
    const design = designChainWheels(t);
    this.chain = new ChainVisual({ asset, track: t.track, beltWidth: t.beltWidth, chainThickness: t.chainThickness, wheels: design });
    this.group.add(this.chain.group);
    this.left = design.map((w) => ({ ...w }));
    this.right = design.map((w) => ({ ...w }));
  }

  /**
   * After the vehicle's bodies are posed.
   * @param stamp snapshot time [ms]: the chain moves by speed × time since the previous snapshot
   */
  update(poses: BodyPoses, layout: VehicleLayout, telemetry: { wheelOmega: number }[], stamp: number, profile?: ArrayLike<number>): void {
    poses.position(layout.chassis, _c);
    poses.rotation(layout.chassis, _q).invert();
    const dt = (stamp - this.lastStamp) / 1000;
    this.lastStamp = stamp;
    const step = dt > 0 && dt < MAX_STEP ? dt : 0;

    [this.left, this.right].forEach((circles, s) => {
      const side = this.sides[s];
      circles[0] = this.idler;
      circles[circles.length - 1] = this.sprocket;
      let speed = 0;
      side.forEach(({ corner, radius }, i) => {
        poses.position(layout.corners[corner].wheel, _w).sub(_c).applyQuaternion(_q);
        const wheel = layout.corners[corner].wheelSpec;
        circles[1 + i] = { z: _w.z, y: _w.y, radius: wheel.radius };
        speed += telemetry[corner].wheelOmega * radius;
      });
      this.distance[s] += (speed / Math.max(1, side.length)) * step;
    });
    // idler and sprocket turn with the chain: forward driving rolls the top toward −Z (negative about +X)
    for (const sp of this.spinners) sp.pivot.rotation.x = -this.distance[sp.side] / sp.radius;
    const lift = profile && this.range ? (side: 0 | 1, z: number) => trackLiftAt(profile, 0, side, z, this.range[0], this.range[1]) : undefined;
    this.chain.update(this.left, this.right, this.distance[0], this.distance[1], lift);
  }
}
