import { BoxGeometry, BufferGeometry, Mesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3, VehicleSpec } from '../types';
import { MAT } from './materials';

const RAIL = 0.1; // Rahmen-Profil [m]

function box(w: number, h: number, l: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(Math.max(w, 0.02), Math.max(h, 0.02), Math.max(l, 0.02)).translate(x, y, z);
}

/**
 * Leiterrahmen statt Karosserie (Chassis-lokal, 1 Draw Call): 2 Längsträger, Querträger je Achse + Enden,
 * plus Konsolen zu jedem Anlenkpunkt der Aufhängung (`mounts`). Physik-Collider bleibt die Chassis-Box.
 */
export function createFrameVisual(spec: VehicleSpec, mounts: Vec3[]): Mesh {
  const [w, h, l] = spec.chassis.size;
  const railX = w * 0.25;
  const y = -h / 2 + RAIL / 2 + 0.1;
  const parts = [box(RAIL, RAIL, l, -railX, y, 0), box(RAIL, RAIL, l, railX, y, 0)];
  for (const z of [-l / 2 + RAIL / 2, l / 2 - RAIL / 2, ...spec.axles.map((a) => a.z)]) {
    parts.push(box(railX * 2 - RAIL * 0.1, RAIL * 0.82, RAIL * 0.78, 0, y, z));
  }
  const seen = new Set<string>();
  let n = 0;
  for (const [mx, my, mz] of mounts) {
    const key = `${mx.toFixed(2)},${my.toFixed(2)},${mz.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rx = Math.abs(mx) < railX ? mx : Math.sign(mx) * railX;
    // Jede Konsole minimal andere Stärke → nie deckungsgleiche Flächen (kein Z-Fighting)
    const t = RAIL * (0.5 + 0.04 * (n++ % 6));
    // Konsole: senkrecht vom Träger auf Höhe des Lagers, dann waagrecht zum Lager
    parts.push(box(t, Math.abs(my - y), t, rx, (my + y) / 2, mz));
    parts.push(box(Math.abs(mx - rx) + t, t * 0.9, t * 1.1, (mx + rx) / 2, my, mz));
  }
  const m = new Mesh(mergeGeometries(parts), MAT.frame);
  m.castShadow = true;
  return m;
}
