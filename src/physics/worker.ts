/// <reference lib="webworker" />
import { initRapier } from './rapier';
import { Simulation } from './Simulation';
import { StepClock } from '../shared/stepClock';
import { wallClock } from '../shared/snapshot';
import type { FromWorker, ToWorker } from '../shared/protocol';

/**
 * Physik-Worker: Rapier läuft hier mit eigenem 120-Hz-Takt (Wanduhr), unabhängig von der Bildrate.
 * Jeder Schritt erzeugt einen Snapshot mit Zeitstempel; der Haupt-Thread interpoliert nach Zeit.
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
    const R = await initRapier();
    sim = new Simulation(R, m);
    clock = new StepClock(wallClock());
    announce(sim);
    for (const p of pending.splice(0)) void handle(p);
    tick();
  } else if (!sim) return;
  else if (m.type === 'input') sim.input = m.input;
  else if (m.type === 'spawn') {
    sim.spawn(m.preset);
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
  // bis zum nächsten fälligen Schritt schlafen (Timer-Auflösung ~1–4 ms)
  setTimeout(tick, Math.max(0, clock.nextAt() - wallClock()));
}
