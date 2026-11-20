/**
 * Lower run of a tracked vehicle's chain: the path of the chain under the wheels (pure geometry, no Rapier/three).
 *
 * The chain runs under every wheel and follows it. Around a wheel it lies on an arc, from the point where it runs onto
 * the wheel to the point where it leaves it; between two wheels it is the straight tangent under both circles. At each of
 * these two points the radius through the wheel centre is perpendicular to the chain, so a point sits at
 * `centre + radius · n` for the outward normal `n` of the tangent.
 *
 * Plane (z, y) like the chassis: z to the rear, y up (forward = −z). The path runs front to rear: z never decreases.
 * Physics (contact probes) and rendering (chain bent over the ground) both use this path, so they agree on where the chain
 * is when nothing lifts it. Circles must be sorted by z ascending: the first is the idler, the last the sprocket.
 */
export interface PathCircle {
  z: number;
  y: number;
  radius: number;
}

export interface PathPoint {
  z: number;
  y: number;
  /** index of the circle whose arc this point lies on, or −1 */
  circle: number;
  /** distance along the path from its start [m] */
  s: number;
}

const HALF_PI = Math.PI / 2;

/** outward normal angle of the lower outer tangent between two circles, in (−π, 0): pointing down */
function tangentNormal(a: PathCircle, b: PathCircle): number {
  const dz = b.z - a.z;
  const dy = b.y - a.y;
  const dist = Math.hypot(dz, dy);
  const k = (a.radius - b.radius) / Math.max(dist, 1e-9);
  if (Math.abs(k) >= 1) return -HALF_PI; // one circle inside the other: no outer tangent, use the bottom
  const phi = Math.atan2(dy, dz);
  const off = Math.acos(k);
  const lower = (psi: number) => Math.sin(psi);
  const c1 = phi + off;
  const c2 = phi - off;
  return lower(c1) < lower(c2) ? wrap(c1) : wrap(c2);
}

/** angle in (−π, π] */
function wrap(a: number): number {
  const t = Math.atan2(Math.sin(a), Math.cos(a));
  return t;
}

/**
 * The path from the front of the first circle to the rear of the last, along the lower side.
 * @param arcStep arc length between points on an arc [m]; straight tangents have just their two end points
 */
export function lowerRunPath(circles: readonly PathCircle[], arcStep = 0.08): PathPoint[] {
  const n = circles.length;
  if (n < 2) throw new Error('lowerRunPath: need at least two circles');
  const psi: number[] = [];
  for (let i = 0; i + 1 < n; i++) psi.push(tangentNormal(circles[i], circles[i + 1]));

  const pts: PathPoint[] = [];
  const push = (i: number, angle: number) => {
    const c = circles[i];
    pts.push({ z: c.z + c.radius * Math.cos(angle), y: c.y + c.radius * Math.sin(angle), circle: i, s: 0 });
  };
  for (let i = 0; i < n; i++) {
    const inAngle = i === 0 ? -Math.PI : psi[i - 1];
    const outAngle = i === n - 1 ? 0 : psi[i];
    if (outAngle < inAngle) {
      // the chain does not wrap this wheel (it hangs high between its neighbours' tangents): a single touch point
      push(i, (inAngle + outAngle) / 2);
      continue;
    }
    const steps = Math.max(1, Math.ceil(((outAngle - inAngle) * circles[i].radius) / arcStep));
    for (let k = 0; k <= steps; k++) push(i, inAngle + ((outAngle - inAngle) * k) / steps);
  }
  for (let i = 1; i < pts.length; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y);
  return pts;
}

/** y of the path at z (linear between points), −Infinity outside the path */
export function lowerRunY(path: readonly PathPoint[], z: number): number {
  if (z < path[0].z || z > path[path.length - 1].z) return -Infinity;
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].z <= z) lo = mid;
    else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const t = b.z - a.z > 1e-9 ? (z - a.z) / (b.z - a.z) : 0;
  return a.y + (b.y - a.y) * t;
}

export interface PathSample {
  z: number;
  y: number;
  /** distance along the path [m] */
  s: number;
}

export interface SampleOptions {
  /** wanted distance between samples [m]: a log's top is about 0.3 m wide, so half of that never misses it */
  spacing: number;
  /** no samples this close to the arc of a road wheel [m]: its collider touches there */
  clearance: number;
  /** samples per free stretch between two road wheels (or an end and its neighbour): at least / at most */
  min: number;
  max: number;
}

/**
 * Contact samples along the path. The stretches between the arcs of the road wheels (circles other than the first and the
 * last: idler and sprocket have no collider) are sampled one by one, `clearance` away from each arc, with
 * `round(length / spacing)` samples (between `min` and `max`), spread evenly: a longer gap gets more samples, a short
 * one never fewer than `min`. The stretch from the front end to the first road wheel and from the last to the rear end
 * count the same way (idler and sprocket arcs are part of them).
 */
export function samplePath(path: readonly PathPoint[], o: SampleOptions): PathSample[] {
  const last = Math.max(...path.map((p) => p.circle));
  const spans: [number, number][] = [];
  for (let c = 1; c < last; c++) {
    const s = path.filter((p) => p.circle === c).map((p) => p.s);
    if (s.length) spans.push([Math.min(...s), Math.max(...s)]);
  }
  const total = path[path.length - 1].s;
  // free stretches: between the arcs, `clearance` away from each
  const stretches: [number, number][] = [];
  let from = 0;
  for (const [s0, s1] of spans) {
    stretches.push([from, s0 - o.clearance]);
    from = s1 + o.clearance;
  }
  stretches.push([from, total]);

  const out: PathSample[] = [];
  let k = 0;
  for (const [a, b] of stretches) {
    const len = b - a;
    if (len <= 1e-6) continue;
    const n = Math.max(o.min, Math.min(o.max, Math.round(len / o.spacing)));
    for (let j = 0; j < n; j++) {
      const s = a + ((j + 0.5) / n) * len;
      while (k > 0 && path[k].s > s) k--;
      while (k + 2 < path.length && path[k + 1].s < s) k++;
      const p = path[k];
      const q = path[k + 1];
      const t = q.s - p.s > 1e-9 ? (s - p.s) / (q.s - p.s) : 0;
      out.push({ z: p.z + (q.z - p.z) * t, y: p.y + (q.y - p.y) * t, s });
    }
  }
  return out;
}
