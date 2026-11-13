/**
 * Snapshot = Zustand nach einem Physik-Schritt, als Float64Array (per Transfer, ohne Kopie).
 *   [0] Generation (wechselt bei Respawn/Preset → alte Snapshots werden verworfen)
 *   [1] Zeitstempel [ms, performance.timeOrigin + now] des simulierten Zeitpunkts
 *   [2] Vorwärtsgeschwindigkeit [m/s]
 *   [3..] je Corner 4 Werte Telemetrie (travel, springForce, wheelOmega, steerAngle)
 *   danach je Körper 7 Werte: ABSOLUTE Position (x, y, z) + Quaternion (x, y, z, w)
 * Absolute Positionen (Float64) entkoppeln den Floating Origin von Worker und Haupt-Thread.
 */
export const HEADER = 3;
export const CORNER_STRIDE = 4;
export const BODY_STRIDE = 7;

export const snapshotLength = (corners: number, bodies: number) =>
  HEADER + corners * CORNER_STRIDE + bodies * BODY_STRIDE;

export const bodyOffset = (corners: number) => HEADER + corners * CORNER_STRIDE;

/** Gemeinsame Uhr für Worker und Haupt-Thread [ms] */
export const wallClock = () => performance.timeOrigin + performance.now();

/**
 * Mischt zwei Snapshots (lineare Werte linear, Quaternionen nlerp mit Vorzeichen-Korrektur –
 * bei 8 ms Abstand praktisch identisch zu slerp, aber billiger).
 */
export function blendSnapshots(a: Float64Array, b: Float64Array, t: number, corners: number, out: Float64Array): void {
  const q0 = bodyOffset(corners);
  for (let i = 0; i < q0; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  out[0] = b[0];
  for (let o = q0; o < a.length; o += BODY_STRIDE) {
    for (let k = 0; k < 3; k++) out[o + k] = a[o + k] + (b[o + k] - a[o + k]) * t;
    const s = a[o + 3] * b[o + 3] + a[o + 4] * b[o + 4] + a[o + 5] * b[o + 5] + a[o + 6] * b[o + 6] < 0 ? -1 : 1;
    let l = 0;
    for (let k = 3; k < 7; k++) {
      const v = a[o + k] + (s * b[o + k] - a[o + k]) * t;
      out[o + k] = v;
      l += v * v;
    }
    l = 1 / Math.sqrt(l);
    for (let k = 3; k < 7; k++) out[o + k] *= l;
  }
}
