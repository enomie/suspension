import { ORIGIN, originShiftFor } from './origin';

export type ShiftListener = (dx: number, dz: number) => void;

/**
 * floating-origin shift in ONE place (one instance per thread):
 * adjust ORIGIN, then notify participants (physics: move bodies; main thread: camera, terrain).
 */
export class OriginShifter {
  private listeners: ShiftListener[] = [];
  shifts = 0;

  /** register participant; returns unsubscribe */
  on(fn: ShiftListener): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  /** check local focus position and shift if needed. true = shifted */
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
