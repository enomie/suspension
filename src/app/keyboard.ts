import type { DriverInput } from '../shared/driverInput';
import { DIFF_LOCK_LEVELS } from '../shared/vehicleSpec';

/** key state → DriverInput. W/S throttle/brake, A/D steer, Space handbrake, L differential lock (cycles 0–100 %), Shift boost (a quarter of the air drag). */
export class Keyboard {
  private down = new Set<string>();
  /** one-shot key presses (e.g. reset) */
  private pressed = new Set<string>();
  /** differential lock step (index into `DIFF_LOCK_LEVELS`), cycled by L */
  private diffLockStep = 0;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // typing in the panel fields must not drive the car or switch presets
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      // Space/arrows do not scroll; F1–F7 are debug toggles (not help/reload)
      if (e.code === 'Space' || e.code.startsWith('Arrow') || /^F[1-7]$/.test(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  /** differential lock level 0…1 (cycled by L) */
  get diffLock(): number {
    return DIFF_LOCK_LEVELS[this.diffLockStep];
  }

  /** back to an open differential (new vehicle) */
  resetDiffLock(): void {
    this.diffLockStep = 0;
    this.pressed.delete('KeyL');
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** true exactly once per key press */
  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  read(): DriverInput {
    if (this.consume('KeyL')) this.diffLockStep = (this.diffLockStep + 1) % DIFF_LOCK_LEVELS.length;
    const k = (c: string) => (this.down.has(c) ? 1 : 0);
    return {
      throttle: Math.max(k('KeyW'), k('ArrowUp')),
      brake: Math.max(k('KeyS'), k('ArrowDown')),
      steer: Math.max(k('KeyA'), k('ArrowLeft')) - Math.max(k('KeyD'), k('ArrowRight')),
      handbrake: this.down.has('Space'),
      diffLock: this.diffLock,
      boost: this.down.has('ShiftLeft') || this.down.has('ShiftRight'),
    };
  }
}
