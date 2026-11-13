import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { ORIGIN, originShiftFor } from './origin';

export type ShiftListener = (dx: number, dz: number) => void;

/**
 * Floating-Origin-Verschiebung an EINER Stelle:
 * ORIGIN anpassen, alle Rapier-Körper verschieben (Joints sind relativ → bleiben gültig),
 * dann alle registrierten Teilnehmer (Kamera, Terrain, Interpolation …) benachrichtigen.
 */
export class OriginShifter {
  private listeners: ShiftListener[] = [];
  shifts = 0;

  /** world = null: nur ORIGIN + Teilnehmer (Haupt-Thread, wenn die Physik im Worker läuft) */
  constructor(private world: RAPIER.World | null) {}

  /** Teilnehmer registrieren; gibt Abmelde-Funktion zurück */
  on(fn: ShiftListener): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  /** prüft die lokale Fokus-Position (Fahrzeug) und verschiebt bei Bedarf. true = verschoben */
  update(localX: number, localZ: number): boolean {
    const s = originShiftFor(localX, localZ);
    if (!s) return false;
    this.apply(s.dx, s.dz);
    return true;
  }

  apply(dx: number, dz: number): void {
    ORIGIN.x += dx;
    ORIGIN.z += dz;
    this.world?.forEachRigidBody((b) => {
      const p = b.translation();
      b.setTranslation({ x: p.x - dx, y: p.y, z: p.z - dz }, false);
    });
    for (const l of this.listeners) l(dx, dz);
    this.shifts++;
  }
}
