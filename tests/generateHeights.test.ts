import { describe, expect, it } from 'vitest';
import { createTerrain, DEFAULT_TERRAIN, HILLS_TERRAIN, WORLD_TERRAIN } from '../src/shared/terrain';
import { softLimit } from '../src/shared/terrain/generator';
import { setTerrain } from '../src/shared/terrain';
import { simplex2, fbm } from '../src/shared/terrain/noise';
import { buildTileArrays, tileSize } from '../src/shared/tileGeometry';
import { TILE_SEGMENTS } from '../src/shared/config';

const t = createTerrain(DEFAULT_TERRAIN);

describe('Terrain-Generator', () => {
  it('Golden Values: Höhenfunktion ändert sich nicht unbemerkt (bitgleich)', () => {
    // Bei ABSICHTLICHER Änderung des Terrains neu erzeugen und hier eintragen.
    const golden: [number, number, number][] = [
      [0, 0, 23.71920890029155],
      [858000.5, 897000.25, 2462.0071854151306],
      [12.5, -33.2, 24.259546188349688],
      [1000.25, 777.75, 75.4244801087091],
      [-54321.5, 98765.125, 83.34734422674967],
      [2000000.25, -1350000.75, 1082.0608864449614],
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

  it('Hügelwelt: base … base + amplitude, mit echter Variation', () => {
    const t = createTerrain(HILLS_TERRAIN);
    const l = HILLS_TERRAIN.layers[0] as { base: number; amplitude: number };
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

describe('Welt: Kontinent + Gebirge', () => {
  const w = createTerrain(WORLD_TERRAIN);
  // grobes Raster über 900 × 900 km
  const H: number[] = [];
  for (let i = 0; i < 300; i++) for (let j = 0; j < 300; j++) H.push(w.height(i * 3000 + 0.5, j * 3000 + 0.5));

  it('~60 % Land, ~40 % Meer', () => {
    const land = H.filter((h) => h > 0).length / H.length;
    expect(land).toBeGreaterThan(0.55);
    expect(land).toBeLessThan(0.65);
  });
  it('Meeresboden bis −1500 m, Gipfel bis 3000 m (nie darüber)', () => {
    expect(Math.min(...H)).toBeGreaterThanOrEqual(-1500);
    expect(Math.min(...H)).toBeLessThan(-1400);
    expect(Math.max(...H)).toBeLessThanOrEqual(3000);
    expect(Math.max(...H)).toBeGreaterThan(2500);
  });
  it('Gebirge sind Züge, nicht flächendeckend (3–15 % über 800 m)', () => {
    const m = H.filter((h) => h > 800).length / H.length;
    expect(m).toBeGreaterThan(0.03);
    expect(m).toBeLessThan(0.15);
  });
  it('findLand: Startpunkt auf flachem Land, deterministisch', () => {
    const p = w.findLand(0, 0, { step: 64 });
    expect(w.height(p.x, p.z)).toBeGreaterThan(5);
    expect(w.height(p.x, p.z)).toBeLessThan(400);
    expect(p.x % 64).toBe(0);
    expect(w.findLand(0, 0, { step: 64 })).toEqual(p);
  });

  it('weiche Obergrenze: stetig, monoton, nie über max', () => {
    let prev = -Infinity;
    for (let h = 2000; h < 10000; h += 7) {
      const v = softLimit(h, -1500, 3000, 300);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThan(3000);
      prev = v;
    }
    expect(softLimit(2600, -1500, 3000, 300)).toBe(2600);
  });
});

describe('Geomorphing-Ziel = Elternkachel', () => {
  it('voll gemorphte Kachel hat an den groben Punkten exakt die Höhe der Elternkachel (auch im Gebirge)', () => {
    setTerrain(WORLD_TERRAIN);
    // Gebirge bei (858 km, 897 km): Kacheln dort
    for (const lod of [0, 3, 7]) {
      const ix = Math.floor(858000 / tileSize(lod)) + 1;
      const iz = Math.floor(897000 / tileSize(lod)) - 1;
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
      expect(worst).toBeLessThan(1e-3);
    }
    setTerrain(HILLS_TERRAIN);
  });
});
