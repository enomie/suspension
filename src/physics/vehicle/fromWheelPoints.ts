import type { AxleSpec, SuspensionType, VehicleSpec, WheelSpec } from './types';
import { makeCar } from './presets/car';

/**
 * Brücke für Editoren mit Raycast-Denkweise: pro Rad nur ein Punkt (chassis-lokal) → komplette VehicleSpec.
 *
 * Ablauf:
 *  1. Punkte nach Längsposition z zu Achsen gruppieren (Toleranz `axleTolerance`)
 *  2. je Achse: 2 Punkte → links/rechts, track = Abstand in X; 1 Punkt → Rad mittig (track 0)
 *  3. Punkt = Radmitte, oder (`pointIs: 'suspensionTop'`) Raycast-Startpunkt → Radmitte = Punkt − restLength nach unten
 *  4. Rollen je Achse: vorderste lenkt, hinterste treibt an + Handbremse (überschreibbar)
 * Nicht symmetrische Achsen werden auf Mittelwerte gebracht und in `warnings` gemeldet.
 * Vorwärts = −Z (vorderste Achse = kleinstes z).
 */
export interface WheelPoint {
  /** chassis-lokal [m] */
  position: [number, number, number];
  /** optional je Rad (sonst `wheel`) */
  radius?: number;
  width?: number;
}

export interface WheelPointOptions {
  name: string;
  label?: string;
  /** Radmitte (Standard) oder Raycast-Startpunkt am Chassis */
  pointIs?: 'wheelCenter' | 'suspensionTop';
  /** nur bei suspensionTop: Abstand Startpunkt → Radmitte in Ruhelage [m] */
  restLength?: number;
  /** Räder mit |Δz| darunter gehören zu einer Achse [m] */
  axleTolerance?: number;
  /** Standard-Rad (Masse, Reibung, Form, Maße) */
  wheel?: Partial<WheelSpec>;
  /** Aufhängung je Achse (Index 0 = vorn); Standard: 'strut' */
  suspension?: SuspensionType | SuspensionType[];
  /** welche Achsen lenken / treiben an / haben Handbremse (Standard: vorne / hinten / hinten) */
  steer?: number[];
  drive?: number[];
  handbrake?: number[];
  /** Rest wie makeCar() (Masse, Federn, Lenkung, Antrieb), hier überschreibbar */
  chassis?: Partial<VehicleSpec['chassis']>;
}

export function specFromWheelPoints(
  points: WheelPoint[],
  o: WheelPointOptions,
): { spec: VehicleSpec; warnings: string[] } {
  if (!points.length) throw new Error('specFromWheelPoints: keine Radpunkte');
  const warnings: string[] = [];
  const tol = o.axleTolerance ?? 0.25;
  const base = makeCar(o.name, o.label ?? o.name, 'strut');
  const wheelBase: WheelSpec = { ...base.axles[0].wheel, ...o.wheel };
  const drop = o.pointIs === 'suspensionTop' ? (o.restLength ?? 0.3) : 0;

  // 1. nach z gruppieren (vorn = kleinstes z)
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
    if (g.length > 2) warnings.push(`Achse ${i}: ${g.length} Räder auf gleicher Höhe – nur äußerstes Paar verwendet`);
    const byX = [...g].sort((a, b) => a.position[0] - b.position[0]);
    const pair = g.length >= 2 ? [byX[0], byX[byX.length - 1]] : [g[0]];
    const avg = (k: 0 | 1 | 2) => pair.reduce((s, p) => s + p.position[k], 0) / pair.length;
    const z = avg(2);
    const y = avg(1) - drop;
    let track = 0;
    if (pair.length === 2) {
      track = pair[1].position[0] - pair[0].position[0];
      const midX = (pair[0].position[0] + pair[1].position[0]) / 2;
      if (Math.abs(midX) > 0.02) warnings.push(`Achse ${i}: nicht mittig (Versatz ${midX.toFixed(3)} m) – symmetrisch gemacht`);
      if (Math.abs(pair[0].position[1] - pair[1].position[1]) > 0.02 || Math.abs(pair[0].position[2] - pair[1].position[2]) > 0.02)
        warnings.push(`Achse ${i}: linkes/rechtes Rad ungleich hoch oder versetzt – Mittelwert verwendet`);
    } else if (Math.abs(g[0].position[0]) > 0.02) {
      warnings.push(`Achse ${i}: Einzelrad nicht mittig – auf X = 0 gesetzt`);
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
