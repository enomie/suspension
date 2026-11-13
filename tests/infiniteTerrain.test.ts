import { afterEach, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysicsTiles } from '../src/physics/terrainColliders';
import { LodTerrain } from '../src/render/terrain/LodTerrain';
import { sampleTerrainHeightWorld } from '../src/shared/terrainHeight';
import { TILE_SIZE } from '../src/shared/config';
import { ORIGIN, originShiftFor } from '../src/shared/origin';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { car } from '../src/physics/vehicle/presets/car';

await RAPIER.init();

afterEach(() => {
  ORIGIN.x = 0;
  ORIGIN.z = 0;
});

function rayY(world: RAPIER.World, x: number, z: number): number {
  const ray = new RAPIER.Ray({ x, y: 200, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, 400, true)!;
  return ray.pointAt(hit.timeOfImpact).y;
}

describe('physics tiles', () => {
  for (const [ox, oz] of [
    [0, 0],
    [2_000_000, -1_350_000],
  ]) {
    it(`match the height function (origin ${ox}, ${oz})`, () => {
      ORIGIN.x = ox;
      ORIGIN.z = oz;
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      const tiles = new PhysicsTiles(RAPIER, world);
      tiles.update(0, 0);
      world.step();
      expect(tiles.count).toBe(9);
      let worst = 0;
      for (let i = 0; i < 300; i++) {
        const x = ((i * 37) % 140) - 45 + 0.13;
        const z = ((i * 53) % 140) - 45 + 0.29;
        worst = Math.max(worst, Math.abs(rayY(world, x, z) - sampleTerrainHeightWorld(x + ox, z + oz)));
      }
      expect(worst).toBeLessThan(0.1);
    });
  }

  it('stream: far tiles are removed, new ones built', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const tiles = new PhysicsTiles(RAPIER, world);
    tiles.update(0, 0);
    tiles.update(TILE_SIZE * 5, 0);
    expect(tiles.count).toBe(9);
    let bodies = 0;
    world.forEachRigidBody(() => bodies++);
    expect(bodies).toBe(9);
  });
});

describe('LOD 0 mesh = physics (same grid + diagonal)', () => {
  it('mesh triangles match heightfield ray hits within 1 mm', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const tiles = new PhysicsTiles(RAPIER, world);
    tiles.update(TILE_SIZE / 2, TILE_SIZE / 2);
    world.step();
    const g = new LodTerrain().buildGeometry(0, 0, 0);
    const pos = g.getAttribute('position');
    const idx = g.getIndex()!;
    const half = TILE_SIZE / 2;
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const x = ((i * 7.31) % TILE_SIZE) + 0.01;
      const z = ((i * 11.7) % TILE_SIZE) + 0.01;
      // Mesh-Höhe: Dreieck suchen, baryzentrisch interpolieren
      let meshY = NaN;
      for (let t = 0; t < idx.count && Number.isNaN(meshY); t += 3) {
        const p = [0, 1, 2].map((k) => {
          const vi = idx.getX(t + k);
          return [pos.getX(vi) + half, pos.getY(vi), pos.getZ(vi) + half];
        });
        const [a, b, c] = p;
        const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(det) < 1e-9) continue;
        const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
        const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) meshY = l1 * a[1] + l2 * b[1] + l3 * c[1];
      }
      worst = Math.max(worst, Math.abs(meshY - rayY(world, x, z)));
    }
    expect(worst).toBeLessThan(0.001);
  });
});

describe('floating origin', () => {
  it('shift only beyond threshold, on 64 m grid', () => {
    expect(originShiftFor(1023, -1023)).toBeNull();
    expect(originShiftFor(1030, 10)).toEqual({ dx: 1024, dz: 0 });
  });

  it('vehicle keeps driving smoothly through an origin shift', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    world.numSolverIterations = 8;
    const tiles = new PhysicsTiles(RAPIER, world);
    tiles.update(0, 0);
    const v = new Vehicle(RAPIER, world, car, { x: 0, y: sampleTerrainHeightWorld(0, 0) + 1.2, z: 0 });
    const input = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    const run = (n: number) => {
      for (let i = 0; i < n; i++) {
        const t = v.chassis.translation();
        tiles.update(t.x, t.z);
        v.applyInput(input, 1 / 120);
        world.step();
      }
    };
    run(360);
    const before = v.forwardSpeed;
    const absBefore = v.chassis.translation().z + ORIGIN.z;
    // Shift um 100 m
    ORIGIN.z += -100;
    world.forEachRigidBody((b) => {
      const p = b.translation();
      b.setTranslation({ x: p.x, y: p.y, z: p.z + 100 }, false);
    });
    expect(v.chassis.translation().z + ORIGIN.z).toBeCloseTo(absBefore, 4);
    run(12);
    v.applyInput(input, 1 / 120);
    expect(Math.abs(v.forwardSpeed - before)).toBeLessThan(1.5);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.2);
  });
});

describe('LOD stability (no flicker)', () => {
  const load = (t: LodTerrain, x: number, y: number, z: number) => {
    t.budgetMs = 1e9;
    for (let i = 0; i < 20; i++) t.update(x, y, z);
  };
  const visibleKeys = (t: LodTerrain) => t.visibleKeys().join('|');

  it('static camera: nothing rebuilt or evicted over 700 frames', () => {
    const t = new LodTerrain();
    load(t, 5, 12, 9);
    const before = visibleKeys(t);
    let builds = 0;
    for (let i = 0; i < 700; i++) {
      t.update(5, 12, 9);
      builds += t.stats.built;
    }
    expect(builds).toBe(0);
    expect(visibleKeys(t)).toBe(before);
  });

  it('camera jitter never toggles tiles back and forth (scan over LOD boundaries)', () => {
    const t = new LodTerrain();
    t.budgetMs = 1e9;
    let toggling = 0;
    // Kamera in 0,5-m-Schritten über mehrere LOD-Grenzen schieben, an jeder Stelle ±0,3 m zittern
    for (let x = 0; x < 120; x += 0.5) {
      const at = (dx: number) => {
        // Verfeinerung geht eine Ebene pro Durchlauf → bis zum eingeschwungenen Zustand laufen lassen
        for (let i = 0; i < 14; i++) t.update(x + dx + i * 1e-3, 8, 20);
        return visibleKeys(t);
      };
      at(0.3);
      at(-0.3);
      if (at(0.3) !== at(-0.3)) toggling++;
    }
    expect(toggling).toBe(0);
  });
});

describe('LOD beim Fahren (Kacheln kommen verzögert wie aus dem Worker)', () => {
  it('kein Hin-und-her-Schalten zwischen grob und fein', () => {
    const t = new LodTerrain();
    t.budgetMs = 1e9;
    for (let i = 0; i < 20; i++) t.update(0, 10, 0);
    t.budgetMs = 0; // ~1 Kachel pro Frame
    const hist = new Map<string, number[]>();
    let prev = new Set(t.visibleKeys());
    let flips = 0;
    for (let f = 0; f < 2000; f++) {
      const z = -f * 0.2 + 9; // 24 m/s bei 120 fps
      t.update(6, sampleTerrainHeightWorld(6, z) + 4, z);
      const cur = new Set(t.visibleKeys());
      for (const k of new Set([...cur, ...prev]))
        if (cur.has(k) !== prev.has(k)) {
          const h = hist.get(k) ?? [];
          h.push(f);
          hist.set(k, h);
          // dieselbe Kachel innerhalb von 60 Frames an → aus → an = Flackern
          if (h.length >= 3 && h[h.length - 1] - h[h.length - 3] < 60) flips++;
        }
      prev = cur;
    }
    expect(flips).toBe(0);
  });
});
