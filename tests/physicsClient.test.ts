import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion } from 'three';
import { PhysicsClient } from '../src/sim/PhysicsClient';
import { VehicleView } from '../src/sim/VehicleView';
import { PRESETS } from '../src/vehicle/presets';
import { blendSnapshots } from '../src/sim/snapshot';

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
      const c = await PhysicsClient.create({ preset: 0, x: 0, z: 0, useWorker: false, R: RAPIER });
      const view = new VehicleView(RAPIER, new RAPIER.World({ x: 0, y: 0, z: 0 }), PRESETS[0]);
      c.cornerCount = view.built.corners.length;
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
        const z = view.built.chassisMesh.position.z;
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

  it('Respawn: alte Snapshots werden verworfen', async () => {
    const c = await PhysicsClient.create({ preset: 0, x: 0, z: 0, useWorker: false, R: RAPIER });
    c.cornerCount = 4;
    let now = performance.timeOrigin + performance.now();
    for (let i = 0; i < 30; i++) c.sample((now += 8.3));
    let spawned = -1;
    c.onSpawn = (g) => (spawned = g);
    c.spawn(6);
    expect(spawned).toBe(1);
    const s = c.sample((now += 8.3))!;
    expect(s[0]).toBe(1);
  });
});
