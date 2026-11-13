import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion } from 'three';
import { PhysicsClient } from '../src/app/PhysicsClient';
import { VehicleVisual } from '../src/render/vehicle/VehicleVisual';
import { blendSnapshots } from '../src/shared/snapshot';

await RAPIER.init();

describe('snapshot interpolation (Physik entkoppelt vom Rendern)', () => {
  it('blend: Quaternion bleibt normiert, kürzester Weg', () => {
    const q = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 } as never, 0.2);
    const a = new Float64Array([0, 0, 0, 0, 0, 0, q.x, q.y, q.z, q.w]);
    const b = new Float64Array([0, 8, 1, 2, 0, 0, -q.x, -q.y, -q.z, -q.w]); // gleiche Drehung, anderes Vorzeichen
    const out = new Float64Array(a.length);
    blendSnapshots(a, b, 0.5, 0, out);
    expect(Math.hypot(out[6], out[7], out[8], out[9])).toBeCloseTo(1, 9);
    expect(Math.abs(out[9])).toBeCloseTo(Math.abs(q.w), 6);
    expect(out[3]).toBeCloseTo(1, 9);
  });

  for (const fps of [60, 100, 120, 144, 240]) {
    it(`${fps} fps mit Frame-Jitter: Fahrzeug läuft nie zurück, kein Sprung`, async () => {
      const c = await PhysicsClient.create({ preset: 0, x: 0, z: 0, useWorker: false });
      const view = new VehicleVisual(c.layout);
      c.setInput({ throttle: 1, brake: 0, steer: 0, handbrake: false });
      let now = performance.timeOrigin + performance.now();
      let prevZ = NaN;
      let worstBack = 0;
      let worstStep = 0;
      const frame = 1000 / fps;
      for (let i = 0; i < fps * 4; i++) {
        now += frame * (0.7 + 0.6 * ((i * 7919) % 13) / 12); // ±30 % Jitter
        const s = c.sample(now);
        if (!s) continue;
        view.apply(s);
        const z = view.chassis.position.z;
        if (i > fps && !Number.isNaN(prevZ)) {
          worstBack = Math.max(worstBack, z - prevZ); // vorwärts = −Z
          worstStep = Math.max(worstStep, Math.abs(z - prevZ));
        }
        prevZ = z;
      }
      expect(worstBack).toBeLessThan(1e-3);
      // max. Strecke pro Frame ≈ v · 1,3 · frame, v < 25 m/s
      expect(worstStep).toBeLessThan(25 * 1.3 * (frame / 1000) + 0.01);
    }, 30000);
  }

  it('Worker-Ruckler (Snapshots kommen gebündelt verspätet): Render-Zeit läuft nie zurück', async () => {
    const c = await PhysicsClient.create({ preset: 0, x: 0, z: 0, useWorker: false });
    const sim = c.simulation!;
    sim.input = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    // Worker nachstellen: eigene Uhr, Snapshots gehen per push() ein; lokale Sim im Client abschalten
    const client = c as unknown as { local: unknown; push(s: Float64Array): void };
    client.local = null;
    const view = new VehicleVisual(c.layout);
    const dt = 1000 / 120;
    let now = 0;
    let simT = 0;
    let prevZ = NaN;
    let worstBack = 0;
    for (let f = 0; f < 900; f++) {
      now += dt;
      // Worker hängt alle ~0,8 s für 45 ms, liefert dann alles auf einmal
      const stalled = f % 100 > 94;
      while (!stalled && simT + dt <= now) {
        sim.step();
        simT += dt;
        client.push(sim.snapshot(simT));
      }
      const s = c.sample(now);
      if (!s) continue;
      view.apply(s);
      const z = view.chassis.position.z;
      if (f > 120 && !Number.isNaN(prevZ)) worstBack = Math.max(worstBack, z - prevZ);
      prevZ = z;
    }
    expect(worstBack).toBeLessThan(1e-3);
  });

  it('Respawn: alte Snapshots werden verworfen', async () => {
    const c = await PhysicsClient.create({ preset: 0, x: 0, z: 0, useWorker: false });
    let now = performance.timeOrigin + performance.now();
    for (let i = 0; i < 30; i++) c.sample((now += 8.3));
    let spawned = -1;
    c.onVehicle = (layout, g) => {
      spawned = g;
      expect(layout.spec.name).toBe('solid');
    };
    c.spawn(6);
    expect(spawned).toBe(1);
    const s = c.sample((now += 8.3))!;
    expect(s[0]).toBe(1);
  });
});

describe('Layout (Physik → Optik ohne Rapier)', () => {
  it('jedes Preset: Indizes gültig, Optik baut ohne Rapier', async () => {
    const c = await PhysicsClient.create({ preset: 0, x: 0, z: 0, useWorker: false });
    for (let p = 0; p < 10; p++) {
      c.spawn(p);
      const L = c.layout;
      const ok = (i: number) => i >= 0 && i < L.bodyCount;
      expect(ok(L.chassis)).toBe(true);
      for (const k of L.corners) expect(ok(k.wheel) && ok(k.knuckle)).toBe(true);
      for (const l of L.links) expect(ok(l.a.body) && ok(l.b.body)).toBe(true);
      // Layout muss per postMessage übertragbar sein
      expect(structuredClone(L)).toEqual(L);
      const v = new VehicleVisual(L);
      let now = performance.timeOrigin + performance.now();
      let s = null;
      for (let i = 0; i < 5 && !s; i++) s = c.sample((now += 10));
      if (s) v.apply(s);
    }
  });
});
