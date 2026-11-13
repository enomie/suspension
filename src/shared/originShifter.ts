import { ORIGIN, originShiftFor } from './origin';

export type ShiftListener = (dx: number, dz: number) => void;

/**
 * Floating-Origin-Verschiebung an EINER Stelle (je Thread eine Instanz):
 * ORIGIN anpassen, dann alle Teilnehmer benachrichtigen (Physik: Körper verschieben;
 * Haupt-Thread: Kamera, Terrain).
 */
export class OriginShifter {
  private listeners: ShiftListener[] = [];
  shifts = 0;

  /** Teilnehmer registrieren; gibt Abmelde-Funktion zurück */
  on(fn: ShiftListener): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  /** prüft die lokale Fokus-Position und verschiebt bei Bedarf. true = verschoben */
  update(localX: number, localZ: number): boolean {
    const s = originShiftFor(localX, localZ);
    if (!s) return false;
    this.apply(s.dx, s.dz);
    return true;
  }

  apply(dx: number, dz: number): void {
    ORIGIN.x += dx;
    ORIGIN.z += dz;
    for (const l of this.listeners) l(dx, dz);
    this.shifts++;
  }
}
