/**
 * Deterministische Noise-Bausteine. Nur + − × ÷, floor, sqrt und 32-Bit-Integer-Operationen
 * (Math.imul, Bit-Shifts) → bitgleiche Ergebnisse in jeder JS-Engine. KEIN Math.pow/sin/exp.
 */

/** 32-Bit-Hash zweier Gitter-Koordinaten + Seed (alles als int32) */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (seed | 0) ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Seed aus Text (FNV-1a) – z. B. Schicht-Name → eigener, stabiler Seed */
export function hashString(s: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

// 2D-Simplex: Schiefe-Konstanten (sqrt ist IEEE-exakt gerundet → deterministisch)
const F2 = (Math.sqrt(3) - 1) / 2;
const G2 = (3 - Math.sqrt(3)) / 6;
// 16 Gradienten gleichmäßig auf dem Kreis (cos/sin vorab als Konstanten, nicht zur Laufzeit)
const GRAD = new Float64Array([
  1, 0, 0.9238795325112867, 0.3826834323650898, 0.7071067811865476, 0.7071067811865476, 0.3826834323650898,
  0.9238795325112867, 0, 1, -0.3826834323650898, 0.9238795325112867, -0.7071067811865476, 0.7071067811865476,
  -0.9238795325112867, 0.3826834323650898, -1, 0, -0.9238795325112867, -0.3826834323650898, -0.7071067811865476,
  -0.7071067811865476, -0.3826834323650898, -0.9238795325112867, 0, -1, 0.3826834323650898, -0.9238795325112867,
  0.7071067811865476, -0.7071067811865476, 0.9238795325112867, -0.3826834323650898,
]);

function corner(ix: number, iz: number, x: number, z: number, seed: number): number {
  let t = 0.5 - x * x - z * z;
  if (t <= 0) return 0;
  const g = (hash2(ix, iz, seed) & 15) * 2;
  t *= t;
  return t * t * (GRAD[g] * x + GRAD[g + 1] * z);
}

/** Gradient-Noise (2D-Simplex), Ergebnis ≈ −1 … 1, Wellenlänge ≈ 1 Einheit */
export function simplex2(x: number, z: number, seed: number): number {
  const s = (x + z) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(z + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const z0 = z - (j - t);
  const i1 = x0 > z0 ? 1 : 0;
  const j1 = 1 - i1;
  const x1 = x0 - i1 + G2;
  const z1 = z0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const z2 = z0 - 1 + 2 * G2;
  return 70 * (corner(i, j, x0, z0, seed) + corner(i + i1, j + j1, x1, z1, seed) + corner(i + 1, j + 1, x2, z2, seed));
}

export interface FbmParams {
  /** Wellenlänge der gröbsten Oktave [m] */
  wavelength: number;
  octaves: number;
  /** Amplitudenfaktor je Oktave (0,5 = klassisch) */
  gain?: number;
  /** Frequenzfaktor je Oktave */
  lacunarity?: number;
}

// feste Drehung je Oktave (≈ 37°) gegen achsparallele Muster
const ROT_C = 0.7986355100472928;
const ROT_S = 0.6018150231520483;

/**
 * Fraktales Rauschen (Summe von Oktaven), normiert auf ≈ −1 … 1.
 * `minWavelength` (optional): Oktaven mit kürzerer Wellenlänge werden weggelassen (Bandbegrenzung für grobe LOD-Stufen).
 */
export function fbm(x: number, z: number, seed: number, p: FbmParams, minWavelength = 0): number {
  const gain = p.gain ?? 0.5;
  const lac = p.lacunarity ?? 2;
  let f = 1 / p.wavelength;
  let wl = p.wavelength;
  let a = 1;
  let sum = 0;
  let norm = 0;
  let px = x;
  let pz = z;
  for (let o = 0; o < p.octaves; o++) {
    if (wl >= minWavelength) {
      sum += a * simplex2(px * f, pz * f, (seed + Math.imul(o, 0x9e3779b1)) | 0);
    }
    norm += a; // Normierung immer über alle Oktaven → Weglassen ändert nur Feinheiten, nicht den Pegel
    a *= gain;
    f *= lac;
    wl /= lac;
    const rx = ROT_C * px - ROT_S * pz;
    pz = ROT_S * px + ROT_C * pz;
    px = rx;
  }
  return sum / norm;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
