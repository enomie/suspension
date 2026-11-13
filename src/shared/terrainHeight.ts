import { TERRAIN_NOISE } from './config';

function hash2D(x: number, y: number, seed: number): number {
  let h = seed ^ (x * 374761393) ^ (y * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = hash2D(x0, y0, seed);
  const v10 = hash2D(x0 + 1, y0, seed);
  const v01 = hash2D(x0, y0 + 1, seed);
  const v11 = hash2D(x0 + 1, y0 + 1, seed);
  const vx0 = v00 + (v10 - v00) * tx;
  const vx1 = v01 + (v11 - v01) * tx;
  return vx0 + (vx1 - vx0) * ty;
}

function fbm(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = TERRAIN_NOISE.baseFrequency;
  let maxValue = 0;
  for (let i = 0; i < TERRAIN_NOISE.octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i * 9973) * amplitude;
    maxValue += amplitude;
    amplitude *= TERRAIN_NOISE.persistence;
    frequency *= TERRAIN_NOISE.lacunarity;
  }
  return value / maxValue;
}

/** Deterministische Geländehöhe [m] an ABSOLUTER Position – überall gleich (Physik, Optik, Worker). */
export function sampleTerrainHeightWorld(xM: number, zM: number): number {
  const n = fbm(xM, zM, TERRAIN_NOISE.seed);
  const shaped = Math.pow(n, 1.35);
  return TERRAIN_NOISE.baseElevationM + shaped * TERRAIN_NOISE.amplitudeM;
}
