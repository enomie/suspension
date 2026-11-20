/**
 * snapshot = state after a physics step, as Float64Array (transfer, no copy).
 *   [0] generation (changes on respawn/preset → old snapshots discarded)
 *   [1] timestamp [ms, performance.timeOrigin + now] of simulated time
 *   [2] forward speed [m/s]
 *   [3..] per corner 4 telemetry values (travel, springForce, wheelOmega, steerAngle)
 *   [extra] optional vehicle-specific block (tracked: ground profile of the chain, `trackProfile.ts`), blended linearly
 *   then per body 7 values: ABSOLUTE position (x, y, z) + quaternion (x, y, z, w)
 * absolute positions (Float64) decouple floating origin from worker and main thread.
 */
export const HEADER = 3;
export const CORNER_STRIDE = 4;
export const BODY_STRIDE = 7;

export const snapshotLength = (corners: number, bodies: number, extra = 0) =>
  HEADER + corners * CORNER_STRIDE + extra + bodies * BODY_STRIDE;

export const bodyOffset = (corners: number, extra = 0) => HEADER + corners * CORNER_STRIDE + extra;

/** shared clock for worker and main thread [ms] */
export const wallClock = () => performance.timeOrigin + performance.now();

/**
 * blends two snapshots (linear values linear, quaternions nlerp with sign fix —
 * at 8 ms spacing practically same as slerp, but cheaper).
 */
export function blendSnapshots(a: Float64Array, b: Float64Array, t: number, corners: number, out: Float64Array, extra = 0): void {
  const q0 = bodyOffset(corners, extra);
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
