import type RAPIER from '@dimforge/rapier3d-simd-compat';
import type { DriverInput } from '../vehicle/types';
import { initRapier } from '../physics/rapierWorld';
import { Simulation, StepClock } from './Simulation';
import type { FromWorker, ToWorker } from './protocol';
import { blendSnapshots, wallClock } from './snapshot';

const MAX_BUFFER = 32;

/**
 * Haupt-Thread-Seite der Physik. Standard: Physik-Worker. Fallback (`?worker=0`, Tests, kein Worker):
 * dieselbe Simulation im Haupt-Thread mit derselben Snapshot-Strecke.
 *
 * Render-Interpolation nach ZEIT: gerendert wird der Zustand bei `now − delay`, gemischt aus den zwei
 * umgebenden Snapshots. `delay` passt sich an (kleinster Wert, bei dem immer ein neuerer Snapshot
 * vorliegt) → keine Sprünge zurück, keine „alten Frames“, auch bei Frame-/Timer-Jitter.
 */
export class PhysicsClient {
  gen = 0;
  preset = 0;
  /** Physik-Zeit pro Schritt [ms] (gemessen im Worker) */
  stepMs = 0;
  /** aktuelle Render-Verzögerung [ms] */
  delayMs = 0;
  readonly mode: 'worker' | 'main';
  onSpawn: (gen: number, preset: number) => void = () => {};

  private buf: Float64Array[] = [];
  private out: Float64Array | null = null;
  private gapMax = 0;
  private worker: Worker | null = null;
  private local: Simulation | null = null;
  private clock: StepClock | null = null;
  private lastInput = '';

  private constructor(mode: 'worker' | 'main') {
    this.mode = mode;
  }

  static async create(opts: {
    preset: number;
    x: number;
    z: number;
    useWorker: boolean;
    R?: typeof RAPIER;
  }): Promise<PhysicsClient> {
    if (opts.useWorker && typeof Worker !== 'undefined') {
      const c = new PhysicsClient('worker');
      const w = new Worker(new URL('./physicsWorker.ts', import.meta.url), { type: 'module' });
      c.worker = w;
      await new Promise<void>((resolve) => {
        w.onmessage = (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.type === 'snapshots') {
            c.stepMs = c.stepMs * 0.9 + m.stepMs * 0.1;
            for (const s of m.list) c.push(s);
          } else {
            c.gen = m.gen;
            c.preset = m.preset;
            c.buf = [];
            if (m.type === 'ready') resolve();
            else c.onSpawn(m.gen, m.preset);
          }
        };
        c.send({ type: 'init', preset: opts.preset, x: opts.x, z: opts.z });
      });
      return c;
    }
    const R: typeof RAPIER = opts.R ?? (await initRapier());
    const c = new PhysicsClient('main');
    c.local = new Simulation(R, opts);
    c.clock = new StepClock(wallClock());
    c.preset = opts.preset;
    return c;
  }

  private send(m: ToWorker): void {
    this.worker!.postMessage(m);
  }

  private push(s: Float64Array): void {
    if (s[0] !== this.gen) return; // Snapshot eines alten Fahrzeugs
    this.buf.push(s);
    if (this.buf.length > MAX_BUFFER) this.buf.shift();
  }

  setInput(input: DriverInput): void {
    const key = `${input.throttle},${input.brake},${input.steer},${input.handbrake}`;
    if (key === this.lastInput) return;
    this.lastInput = key;
    if (this.worker) this.send({ type: 'input', input });
    else this.local!.input = { ...input };
  }

  spawn(preset: number): void {
    if (this.worker) return this.send({ type: 'spawn', preset });
    const s = this.local!;
    s.spawn(preset);
    this.gen = s.gen;
    this.preset = s.preset;
    this.buf = [];
    this.onSpawn(this.gen, this.preset);
  }

  /**
   * Interpolierter Zustand für `now` (absolut, Layout wie Snapshot) oder null, solange keiner da ist.
   * Im Fallback-Modus werden hier auch die fälligen Schritte gerechnet.
   */
  sample(now = wallClock()): Float64Array | null {
    if (this.local) {
      const t0 = performance.now();
      const k = this.clock!.due(now);
      for (let i = 0; i < k; i++) {
        this.local.step();
        this.push(this.local.snapshot(this.clock!.stampNext()));
      }
      if (k) this.stepMs = this.stepMs * 0.9 + ((performance.now() - t0) / k) * 0.1;
    }
    const b = this.buf;
    if (!b.length) return null;
    // Abstand zum neuesten Snapshot; delay = beobachtetes Maximum (langsam abklingend)
    const gap = now - b[b.length - 1][1];
    this.gapMax = Math.max(gap, this.gapMax - 0.02);
    this.delayMs = Math.min(60, Math.max(0, this.gapMax + 0.5));
    const t = now - this.delayMs;

    if (!this.out || this.out.length !== b[0].length) this.out = new Float64Array(b[0].length);
    let i = b.length - 1;
    while (i > 0 && b[i - 1][1] > t) i--;
    const s1 = b[i];
    const s0 = i > 0 ? b[i - 1] : s1;
    const span = s1[1] - s0[1];
    const a = span > 0 ? Math.min(1, Math.max(0, (t - s0[1]) / span)) : 1;
    const corners = this.cornerCount;
    blendSnapshots(s0, s1, a, corners, this.out);
    // ältere Snapshots als s0 werden nicht mehr gebraucht
    if (i > 1) b.splice(0, i - 1);
    return this.out;
  }

  /** Anzahl Corners des aktuellen Fahrzeugs (vom Haupt-Thread gesetzt, für das Layout) */
  cornerCount = 0;

  /** Debug-Zugriff im Fallback-Modus */
  get simulation(): Simulation | null {
    return this.local;
  }

  dispose(): void {
    this.worker?.terminate();
  }
}
