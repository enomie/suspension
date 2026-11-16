import type { AxleSpec, SuspensionType, VehicleSpec, WheelSpec } from './types';
import { makeCar } from './presets/car';

/**
 * bridge for raycast-style editors: one point per wheel (chassis-local) → full VehicleSpec.
 *
 * flow:
 *  1. group points by longitudinal z into axles (tolerance `axleTolerance`)
 *  2. per axle: 2 points → L/R, track = X spacing; 1 point → centered wheel (track 0)
 *  3. point = wheel center, or (`pointIs: 'suspensionTop'`) raycast start → wheel center = point − restLength down
 *  4. roles per axle: frontmost steers, rearmost drives + handbrake (overridable)
 * asymmetric axles averaged and reported in `warnings`.
 * forward = −Z (frontmost axle = smallest z).
 */
export interface WheelPoint {
  /** chassis-lokal [m] */
  position: [number, number, number];
  /** optional per wheel (else `wheel`) */
  radius?: number;
  width?: number;
}

export interface WheelPointOptions {
  name: string;
  label?: string;
  /** wheel center (default) or raycast start on chassis */
  pointIs?: 'wheelCenter' | 'suspensionTop';
  /** only for suspensionTop: start point → wheel center at rest [m] */
  restLength?: number;
  /** wheels with |Δz| below belong to one axle [m] */
  axleTolerance?: number;
  /** default wheel (mass, friction, shape, size) */
  wheel?: Partial<WheelSpec>;
  /** suspension per axle (index 0 = front); default: 'strut' */
  suspension?: SuspensionType | SuspensionType[];
  /** which axles steer / drive / handbrake (default: front / rear / rear) */
  steer?: number[];
  drive?: number[];
  handbrake?: number[];
  /** rest like makeCar() (mass, springs, steering, drive), overridable here */
  chassis?: Partial<VehicleSpec['chassis']>;
}

export function specFromWheelPoints(
  points: WheelPoint[],
  o: WheelPointOptions,
): { spec: VehicleSpec; warnings: string[] } {
  if (!points.length) throw new Error('specFromWheelPoints: no wheel points');
  const warnings: string[] = [];
  const tol = o.axleTolerance ?? 0.25;
  const base = makeCar(o.name, o.label ?? o.name, 'strut');
  const wheelBase: WheelSpec = { ...base.axles[0].wheel, ...o.wheel };
  const drop = o.pointIs === 'suspensionTop' ? (o.restLength ?? 0.3) : 0;

  // 1. group by z (front = smallest z)
  const sorted = [...points].sort((a, b) => a.position[2] - b.position[2]);
  const groups: WheelPoint[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(p.position[2] - g[0].position[2]) <= tol) g.push(p);
    else groups.push([p]);
  }

  const n = groups.length;
  const pick = (list: number[] | undefined, def: number[]) => new Set(list ?? def);
  const steer = pick(o.steer, [0]);
  const drive = pick(o.drive, [n - 1]);
  const hand = pick(o.handbrake, [n - 1]);
  const susp = (i: number): SuspensionType =>
    Array.isArray(o.suspension) ? (o.suspension[i] ?? 'strut') : (o.suspension ?? 'strut');

  const axles: AxleSpec[] = groups.map((g, i) => {
    if (g.length > 2) warnings.push(`Axle ${i}: ${g.length} wheels at same height — only outermost pair used`);
    const byX = [...g].sort((a, b) => a.position[0] - b.position[0]);
    const pair = g.length >= 2 ? [byX[0], byX[byX.length - 1]] : [g[0]];
    const avg = (k: 0 | 1 | 2) => pair.reduce((s, p) => s + p.position[k], 0) / pair.length;
    const z = avg(2);
    const y = avg(1) - drop;
    let track = 0;
    if (pair.length === 2) {
      track = pair[1].position[0] - pair[0].position[0];
      const midX = (pair[0].position[0] + pair[1].position[0]) / 2;
      if (Math.abs(midX) > 0.02) warnings.push(`Axle ${i}: not centered (offset ${midX.toFixed(3)} m) — made symmetric`);
      if (Math.abs(pair[0].position[1] - pair[1].position[1]) > 0.02 || Math.abs(pair[0].position[2] - pair[1].position[2]) > 0.02)
        warnings.push(`Axle ${i}: left/right wheel uneven height or offset — average used`);
    } else if (Math.abs(g[0].position[0]) > 0.02) {
      warnings.push(`Axle ${i}: single wheel not centered — set to X = 0`);
    }
    const radius = pair.reduce((s, p) => s + (p.radius ?? wheelBase.radius), 0) / pair.length;
    const width = pair.reduce((s, p) => s + (p.width ?? wheelBase.width), 0) / pair.length;
    const front = base.axles[0];
    const rear = base.axles[1];
    const ref = i === 0 ? front : rear;
    const type = susp(i);
    return {
      z,
      y,
      track,
      suspension: type,
      spring: { ...ref.spring },
      wheel: { ...wheelBase, radius, width },
      steer: steer.has(i) ? { maxAngle: front.steer!.maxAngle } : undefined,
      drive: drive.has(i) ? { share: 1 / drive.size } : undefined,
      brake: { ...ref.brake },
      handbrake: hand.has(i) ? { torque: rear.handbrake!.torque } : undefined,
      bogieSpacing: type === 'bogie' ? 0.9 : undefined,
    };
  });

  const spec: VehicleSpec = { ...base, axles, chassis: { ...base.chassis, ...o.chassis } };
  return { spec, warnings };
}
