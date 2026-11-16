/// <reference lib="webworker" />
import { initRapier } from './rapier';
import { Simulation } from './Simulation';
import { StepClock } from '../shared/stepClock';
import { wallClock } from '../shared/snapshot';
import type { FromWorker, ToWorker } from '../shared/protocol';

/**
 * Physics worker: Rapier runs here on its own 120 Hz wall-clock tick, independent of frame rate.
 * Each step produces a timestamped snapshot; the main thread interpolates by time.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

let sim: Simulation | null = null;
let clock: StepClock;
const pending: ToWorker[] = [];

const announce = (s: Simulation) => post({ type: 'vehicle', gen: s.gen, preset: s.preset, layout: s.layout });

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  if (!sim && e.data.type !== 'init') return void pending.push(e.data);
  void handle(e.data);
};

async function handle(m: ToWorker): Promise<void> {
  if (m.type === 'init') {
    const R = await initRapier().catch((err) => {
      console.error('[physics worker] Rapier init', err);
      throw err;
    });
    sim = new Simulation(R, m);
    clock = new StepClock(wallClock());
    announce(sim);
    for (const p of pending.splice(0)) void handle(p);
    tick();
  } else if (!sim) return;
  else if (m.type === 'input') sim.input = m.input;
  else if (m.type === 'spawn') {
    sim.spawn(m.preset, m.spec);
    announce(sim);
  }
}

function tick(): void {
  const s = sim!;
  const k = clock.due(wallClock());
  if (k > 0) {
    const list: Float64Array[] = [];
    const t0 = performance.now();
    for (let i = 0; i < k; i++) {
      s.step();
      list.push(s.snapshot(clock.stampNext()));
    }
    post({ type: 'snapshots', list, stepMs: (performance.now() - t0) / k }, list.map((a) => a.buffer));
  }
  // sleep until the next due step (timer resolution ~1–4 ms)
  setTimeout(tick, Math.max(0, clock.nextAt() - wallClock()));
}
