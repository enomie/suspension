import { describe, expect, it } from 'vitest';
import { createTerrain, DEFAULT_TERRAIN } from '../src/shared/terrain';
import { simplex2, fbm } from '../src/shared/terrain/noise';
import { buildTileArrays, tileSize } from '../src/shared/tileGeometry';
import { TILE_SEGMENTS } from '../src/shared/config';

const t = createTerrain(DEFAULT_TERRAIN);

describe('Terrain-Generator', () => {
  it('Golden Values: Höhenfunktion ändert sich nicht unbemerkt (bitgleich)', () => {
    // Bei ABSICHTLICHER Änderung des Terrains neu erzeugen und hier eintragen.
    const golden: [number, number, number][] = [
      [0, 0, 4.5],
      [12.5, -33.2, 5.101901212699477],
      [1000.25, 777.75, 3.474059902088719],
      [-54321.5, 98765.125, 5.771483708840468],
      [2000000.25, -1350000.75, 2.9956669117390926],
    ];
    for (const [x, z, h] of golden) expect(t.height(x, z)).toBe(h);
  });

  it('deterministisch: zwei Generatoren aus derselben Konfiguration sind identisch', () => {
    const u = createTerrain(structuredClone(DEFAULT_TERRAIN));
    for (let i = 0; i < 500; i++) {
      const x = i * 97.31 - 20000;
      const z = i * -53.7 + 4000;
      expect(u.height(x, z)).toBe(t.height(x, z));
    }
  });

  it('anderer Seed → anderes Gelände', () => {
    const u = createTerrain({ ...DEFAULT_TERRAIN, seed: 1 });
    let diff = 0;
    for (let i = 0; i < 100; i++) diff += Math.abs(u.height(i * 13, i * 7) - t.height(i * 13, i * 7));
    expect(diff).toBeGreaterThan(10);
  });

  it('Wertebereich: base … base + amplitude, mit echter Variation', () => {
    const l = DEFAULT_TERRAIN.layers[0];
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const h = t.height(((i * 37) % 2000) - 1000 + 0.3, ((i * 53) % 2000) - 1000 + 0.7);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(min).toBeGreaterThanOrEqual(l.base);
    expect(max).toBeLessThanOrEqual(l.base + l.amplitude);
    expect(max - min).toBeGreaterThan(2);
  });

  it('Simplex-Noise: Bereich ≈ ±1, stetig', () => {
    let m = 0;
    for (let i = 0; i < 20000; i++) m = Math.max(m, Math.abs(simplex2(i * 0.173, i * 0.071, 7)));
    expect(m).toBeLessThan(1.05);
    expect(m).toBeGreaterThan(0.5);
    expect(Math.abs(simplex2(10, 10, 7) - simplex2(10.001, 10, 7))).toBeLessThan(0.01);
  });

  it('Bandbegrenzung lässt nur feine Oktaven weg', () => {
    const p = { wavelength: 100, octaves: 5 };
    const full = fbm(123.4, 567.8, 3, p);
    const coarse = fbm(123.4, 567.8, 3, p, 30); // nur 100 m + 50 m
    expect(Math.abs(full - coarse)).toBeLessThan(0.35);
    expect(fbm(123.4, 567.8, 3, p, 0)).toBe(full);
  });
});

describe('Geomorphing-Ziel = Elternkachel', () => {
  it('voll gemorphte Kachel hat an den groben Punkten exakt die Höhe der Elternkachel', () => {
    for (const lod of [0, 3, 7]) {
      const ix = 5;
      const iz = -3;
      const child = buildTileArrays(lod, ix, iz);
      const parent = buildTileArrays(lod + 1, ix >> 1, iz >> 1);
      const N = TILE_SEGMENTS;
      const cs = tileSize(lod);
      const ps = tileSize(lod + 1);
      let worst = 0;
      for (let j = 0; j <= N; j += 2)
        for (let i = 0; i <= N; i += 2) {
          const k = j * (N + 1) + i;
          const morphed = child.position[k * 3 + 1] + child.morph[k];
          // gleicher Weltpunkt in der Elternkachel
          const wx = ix * cs + i * (cs / N);
          const wz = iz * cs + j * (cs / N);
          const pi = Math.round((wx - (ix >> 1) * ps) / (ps / N));
          const pj = Math.round((wz - (iz >> 1) * ps) / (ps / N));
          worst = Math.max(worst, Math.abs(morphed - parent.position[(pj * (N + 1) + pi) * 3 + 1]));
        }
      expect(worst).toBeLessThan(1e-4);
    }
  });
});
