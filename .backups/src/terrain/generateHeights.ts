import {
  TERRAIN_COLS,
  TERRAIN_NOISE,
  TERRAIN_ROWS,
  TERRAIN_SIZE_M,
} from './terrainConfig';

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

export function sampleTerrainHeightWorld(xM: number, zM: number): number {
  const n = fbm(xM, zM, TERRAIN_NOISE.seed);
  const shaped = Math.pow(n, 1.35);
  return TERRAIN_NOISE.baseElevationM + shaped * TERRAIN_NOISE.amplitudeM;
}

/**
 * Rapier heightfield: column-major, (nrows+1)*(ncols+1) samples.
 * Grid centered on origin: x/z from -size/2 .. +size/2.
 */
export function generateHeightfieldHeights(): Float32Array {
  const rows = TERRAIN_ROWS;
  const cols = TERRAIN_COLS;
  const count = (rows + 1) * (cols + 1);
  const heights = new Float32Array(count);
  const half = TERRAIN_SIZE_M / 2;

  for (let col = 0; col <= cols; col++) {
    for (let row = 0; row <= rows; row++) {
      // Rapier: Zeilen laufen entlang Z, Spalten entlang X
      const zM = -half + (row / rows) * TERRAIN_SIZE_M;
      const xM = -half + (col / cols) * TERRAIN_SIZE_M;
      const h = sampleTerrainHeightWorld(xM, zM);
      heights[col * (rows + 1) + row] = h;
    }
  }

  return heights;
}

/** Same heights laid out for Three.js PlaneGeometry vertex order (row along Z, column along X). */
export function generatePlaneVertexHeights(): Float32Array {
  const rows = TERRAIN_ROWS;
  const cols = TERRAIN_COLS;
  const count = (rows + 1) * (cols + 1);
  const heights = new Float32Array(count);
  const half = TERRAIN_SIZE_M / 2;

  for (let iz = 0; iz <= cols; iz++) {
    for (let ix = 0; ix <= rows; ix++) {
      const xM = -half + (ix / rows) * TERRAIN_SIZE_M;
      const zM = -half + (iz / cols) * TERRAIN_SIZE_M;
      heights[iz * (rows + 1) + ix] = sampleTerrainHeightWorld(xM, zM);
    }
  }

  return heights;
}

export function getHeightStats(heights: Float32Array): { min: number; max: number; avg: number } {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    min = Math.min(min, h);
    max = Math.max(max, h);
    sum += h;
  }
  return { min, max, avg: sum / heights.length };
}
