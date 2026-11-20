import type { DriverInput } from '../shared/driverInput';
import type { VehicleSpec } from '../shared/vehicleSpec';
import type { TrackedVehicleSpec } from '../shared/trackedSpec';
import type { VehicleLayout } from '../shared/vehicleLayout';
import type { FromWorker, ToWorker } from '../shared/protocol';
import { blendSnapshots, wallClock } from '../shared/snapshot';
import { StepClock } from '../shared/stepClock';
import type { Simulation } from '../physics/Simulation';
import { terrain } from '../shared/terrain';

const MAX_BUFFER = 32;
/** window for delay measurement [ms] */
const GAP_WINDOW = 500;

export type VehicleListener = (layout: VehicleLayout, gen: number, preset: number) => void;

/**
 * Main-thread side of physics. Default: physics worker. Fallback (`?worker=0`, tests):
 * same simulation on the main thread (dynamic import) with the same snapshot pipeline.
 *
 * Render interpolation by TIME: draw state at `now − delay`, blended from the two
 * surrounding snapshots. `delay` adapts (smallest value where a newer snapshot always
 * exists) → no backward jumps, even with frame/timer jitter.
 */
export class PhysicsClient {
  gen = 0;
  preset = 0;
  layout!: VehicleLayout;
  /** physics time per step [ms] */
  stepMs = 0;
  /** current render delay [ms] */
  delayMs = 0;
  /** debug: true = always show newest snapshot (no interpolation) */
  raw = false;
  readonly mode: 'worker' | 'main';
  /** new vehicle (start, respawn, preset) */
  onVehicle: VehicleListener = () => {};

  private buf: Float64Array[] = [];
  private out: Float64Array | null = null;
  /** observed gaps to newest snapshot [time, gap] over the last GAP_WINDOW ms */
  private gaps: [number, number][] = [];
  /** last rendered time (monotonic per vehicle) */
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
      await new Promise<void>((resolve, reject) => {
        const fail = (msg: string) => {
          w.terminate();
          reject(new Error(msg));
        };
        w.onerror = () => fail('physics worker failed to start (see console)');
        w.onmessageerror = () => fail('physics worker: invalid message');
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
    // fallback: physics on main thread (only here is Rapier loaded on main thread)
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
    if (s[0] !== this.gen) return; // snapshot from an old vehicle
    this.buf.push(s);
    if (this.buf.length > MAX_BUFFER) this.buf.shift();
  }

  setInput(input: DriverInput): void {
    const key = `${input.throttle},${input.brake},${input.steer},${input.handbrake},${input.diffLock},${input.boost}`;
    if (key === this.lastInput) return;
    this.lastInput = key;
    if (this.worker) this.send({ type: 'input', input });
    else this.local!.input = { ...input };
  }

  /** `custom` = freely assembled vehicle (preset index -1) */
  spawn(preset: number, custom?: VehicleSpec | TrackedVehicleSpec): void {
    if (this.worker) return this.send({ type: 'spawn', preset, spec: custom });
    const s = this.local!;
    s.spawn(preset, custom);
    this.setVehicle(s.layout, s.gen, s.preset);
  }

  /**
   * Interpolated state for `now` (absolute, layout like snapshot) or null until one exists.
   * In fallback mode, due steps are advanced here too.
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
    // delay = largest gap to newest snapshot in window (shrinks quickly after stutter)
    const g = this.gaps;
    g.push([now, now - b[b.length - 1][1]]);
    while (g.length && g[0][0] < now - GAP_WINDOW) g.shift();
    let gapMax = 0;
    for (const [, v] of g) gapMax = Math.max(gapMax, v);
    // ease in so render time does not jump (otherwise jitter)
    const target = Math.min(60, Math.max(0, gapMax + 0.5));
    this.delayMs += target > this.delayMs ? target - this.delayMs : (target - this.delayMs) * 0.05;
    // render time NEVER runs backward (otherwise an older pose flashes); pause briefly if needed
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
    // snapshots older than s0 are no longer needed
    if (i > 1) b.splice(0, i - 1);
    return this.out;
  }

  /** debug access in fallback mode */
  get simulation(): Simulation | null {
    return this.local;
  }

  dispose(): void {
    this.worker?.terminate();
  }
}
