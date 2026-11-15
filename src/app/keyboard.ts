import type { DriverInput } from '../shared/vehicleSpec';

/** Tastenzustand → DriverInput. W/S Gas/Bremse, A/D Lenkung, Space Handbremse (hinten), Shift Boost (doppelte Leistung und Höchstgeschwindigkeit). */
export class Keyboard {
  private down = new Set<string>();
  /** einmalige Tastendrücke (z. B. Reset) */
  private pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Space/Pfeile scrollen nicht; F1–F7 sind Debug-Schalter (statt Hilfe/Neu laden)
      if (e.code === 'Space' || e.code.startsWith('Arrow') || /^F[1-7]$/.test(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** true genau einmal pro Tastendruck */
  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  read(): DriverInput {
    const k = (c: string) => (this.down.has(c) ? 1 : 0);
    return {
      throttle: Math.max(k('KeyW'), k('ArrowUp')),
      brake: Math.max(k('KeyS'), k('ArrowDown')),
      steer: Math.max(k('KeyA'), k('ArrowLeft')) - Math.max(k('KeyD'), k('ArrowRight')),
      handbrake: this.down.has('Space'),
      boost: this.down.has('ShiftLeft') || this.down.has('ShiftRight'),
    };
  }
}
