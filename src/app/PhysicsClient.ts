import type { DriverInput } from '../shared/vehicleSpec';
import type { VehicleLayout } from '../shared/vehicleLayout';
import type { FromWorker, ToWorker } from '../shared/protocol';
import { blendSnapshots, wallClock } from '../shared/snapshot';
import { StepClock } from '../shared/stepClock';
import type { Simulation } from '../physics/Simulation';
import { terrain } from '../shared/terrain';

const MAX_BUFFER = 32;
/** Fenster für die Verzögerungs-Messung [ms] */
const GAP_WINDOW = 500;

export type VehicleListener = (layout: VehicleLayout, gen: number, preset: number) => void;

/**
 * Haupt-Thread-Seite der Physik. Standard: Physik-Worker. Fallback (`?worker=0`, Tests):
 * dieselbe Simulation im Haupt-Thread (dynamisch geladen) mit derselben Snapshot-Strecke.
 *
 * Render-Interpolation nach ZEIT: gerendert wird der Zustand bei `now − delay`, gemischt aus den zwei
 * umgebenden Snapshots. `delay` passt sich an (kleinster Wert, bei dem immer ein neuerer Snapshot
 * vorliegt) → keine Sprünge zurück, auch bei Frame-/Timer-Jitter.
 */
export class PhysicsClient {
  gen = 0;
  preset = 0;
  layout!: VehicleLayout;
  /** Physik-Zeit pro Schritt [ms] */
  stepMs = 0;
  /** aktuelle Render-Verzögerung [ms] */
  delayMs = 0;
  /** Debug: true = immer den neuesten Snapshot zeigen (keine Interpolation) */
  raw = false;
  readonly mode: 'worker' | 'main';
  /** neues Fahrzeug (Start, Respawn, Preset) */
  onVehicle: VehicleListener = () => {};

  private buf: Float64Array[] = [];
  private out: Float64Array | null = null;
  /** beobachtete Abstände zum neuesten Snapshot [Zeit, Abstand] der letzten GAP_WINDOW ms */
  private gaps: [number, number][] = [];
  /** zuletzt gerenderter Zeitpunkt (monoton je Fahrzeug) */
  private renderTime = -Infinity;
  private worker: Worker | null = null;
  private local: Simulation | null = null;
  private clock: StepClock | null = null;
  private lastInput = '';

  private constructor(mode: 'worker' | 'main') {
    this.mode = mode;
  }

  static async create(opts: { preset: number; x: number; z: number; useWorker: boolean }): Promise<PhysicsClient> {
    if (opts.useWorker && typeof Worker !== 'undefined') {
      const c = new PhysicsClient('worker');
      const w = new Worker(new URL('../physics/worker.ts', import.meta.url), { type: 'module' });
      c.worker = w;
      await new Promise<void>((resolve) => {
        w.onmessage = (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.type === 'snapshots') {
            c.stepMs = c.stepMs * 0.9 + m.stepMs * 0.1;
            for (const s of m.list) c.push(s);
          } else {
            const first = !c.layout;
            c.setVehicle(m.layout, m.gen, m.preset);
            if (first) resolve();
          }
        };
        c.send({ type: 'init', preset: opts.preset, x: opts.x, z: opts.z, terrain: terrain().config });
      });
      return c;
    }
    // Fallback: Physik im Haupt-Thread (nur hier wird Rapier in den Haupt-Thread geladen)
    const [{ initRapier }, { Simulation }] = await Promise.all([
      import('../physics/rapier'),
      import('../physics/Simulation'),
    ]);
    const c = new PhysicsClient('main');
    c.local = new Simulation(await initRapier(), { ...opts, terrain: terrain().config });
    c.clock = new StepClock(wallClock());
    c.setVehicle(c.local.layout, c.local.gen, c.local.preset);
    return c;
  }

  private setVehicle(layout: VehicleLayout, gen: number, preset: number): void {
    this.layout = layout;
    this.gen = gen;
    this.preset = preset;
    this.buf = [];
    this.gaps = [];
    this.renderTime = -Infinity;
    this.onVehicle(layout, gen, preset);
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
    this.setVehicle(s.layout, s.gen, s.preset);
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
    if (this.raw) return b[b.length - 1];
    // delay = größter Abstand zum neuesten Snapshot im Fenster (nach Rucklern schnell wieder klein)
    const g = this.gaps;
    g.push([now, now - b[b.length - 1][1]]);
    while (g.length && g[0][0] < now - GAP_WINDOW) g.shift();
    let gapMax = 0;
    for (const [, v] of g) gapMax = Math.max(gapMax, v);
    // weich nachführen, damit sich die Render-Zeit nicht sprunghaft ändert (sonst Ruckeln)
    const target = Math.min(60, Math.max(0, gapMax + 0.5));
    this.delayMs += target > this.delayMs ? target - this.delayMs : (target - this.delayMs) * 0.05;
    // Render-Zeit läuft NIE rückwärts (sonst blitzt eine ältere Pose auf); notfalls kurz anhalten
    const t = Math.max(this.renderTime, now - this.delayMs);
    this.renderTime = t;

    if (!this.out || this.out.length !== b[0].length) this.out = new Float64Array(b[0].length);
    let i = b.length - 1;
    while (i > 0 && b[i - 1][1] > t) i--;
    const s1 = b[i];
    const s0 = i > 0 ? b[i - 1] : s1;
    const span = s1[1] - s0[1];
    const a = span > 0 ? Math.min(1, Math.max(0, (t - s0[1]) / span)) : 1;
    blendSnapshots(s0, s1, a, this.layout.corners.length, this.out);
    // ältere Snapshots als s0 werden nicht mehr gebraucht
    if (i > 1) b.splice(0, i - 1);
    return this.out;
  }

  /** Debug-Zugriff im Fallback-Modus */
  get simulation(): Simulation | null {
    return this.local;
  }

  dispose(): void {
    this.worker?.terminate();
  }
}
