/**
 * Chain loop of a tracked vehicle (pure geometry, no Rapier/three).
 *
 * The chain is a taut belt around the wheels: the convex hull of the wheel circles, seen from the side. The plane is
 * (z, y): z to the right, y up, like the vehicle's chassis coordinates (forward = −z). The loop runs counter-clockwise,
 * which is the direction of a chain on a vehicle driving forward: the lower run moves toward +z (backwards relative
 * to the vehicle), the upper run toward −z.
 *
 * The loop is recomputed from the current wheel positions, so it follows the suspension. Links are placed at equal
 * spacing along it (`linkLayout`); advancing their distance by the track speed makes the chain appear to roll.
 */

/** One wheel seen from the side: centre (z, y) and the radius of the chain's centre line around it */
export interface ChainCircle {
  z: number;
  y: number;
  radius: number;
}

/** Position of a point on the loop and the direction the chain travels there */
export interface ChainPose {
  z: number;
  y: number;
  /** direction of travel in the (z, y) plane [rad], `atan2(dy, dz)`. The outer side of the chain is to the right of it. */
  angle: number;
}

export interface ChainLoop {
  /** total length of the centre line [m] */
  readonly length: number;
  /** indices (into the input) of the circles the chain touches, in loop order */
  readonly wrapped: readonly number[];
  /** pose at distance `s` [m] along the loop (any real number, wraps around) */
  at(s: number, out?: ChainPose): ChainPose;
}

const TWO_PI = Math.PI * 2;
const EPS = 1e-9;

/** angle `a` brought into [0, 2π), values within EPS of 2π count as 0 */
function ccwDelta(a: number): number {
  const d = ((a % TWO_PI) + TWO_PI) % TWO_PI;
  return d > TWO_PI - EPS ? 0 : d;
}

interface Piece {
  /** distance at which the piece starts */
  s0: number;
  length: number;
  /** arc: circle index and start angle of the outward normal; line: start point and unit direction */
  circle?: number;
  psi0?: number;
  z0?: number;
  y0?: number;
  tz?: number;
  ty?: number;
}

/**
 * Builds the loop around the given circles. Circles inside the hull of the others are skipped (`wrapped` lists the rest).
 * @param chainThickness thickness of the chain [m]: the centre line runs half of it outside the wheel radius
 * @param wheels wheel circles with the radius of the wheel itself, at least one
 */
export function buildChainLoop(wheels: readonly ChainCircle[], chainThickness: number): ChainLoop {
  if (wheels.length < 1) throw new Error('buildChainLoop: need at least one wheel');
  const c = wheels.map((w) => ({ z: w.z, y: w.y, r: w.radius + chainThickness / 2 }));

  // start at the lowest point of the hull: the circle with the lowest bottom, the rearmost one if several are level
  let start = 0;
  for (let i = 1; i < c.length; i++) {
    const bi = c[i].y - c[i].r;
    const bs = c[start].y - c[start].r;
    if (bi < bs - EPS || (Math.abs(bi - bs) <= EPS && c[i].z < c[start].z)) start = i;
  }

  const pieces: Piece[] = [];
  const wrapped: number[] = [];
  let s = 0;
  let cur = start;
  let psi = -Math.PI / 2; // outward normal where the chain arrives on the current circle (pointing down)

  for (let guard = 0; guard <= c.length * 2; guard++) {
    // next circle: the tangent whose outward normal is the first one reached turning counter-clockwise from `psi`
    let next = -1;
    let bestDelta = Infinity;
    let bestPsi = 0;
    let bestDist = 0;
    for (let j = 0; j < c.length; j++) {
      if (j === cur) continue;
      const dz = c[j].z - c[cur].z;
      const dy = c[j].y - c[cur].y;
      const dist = Math.hypot(dz, dy);
      const k = c[cur].r - c[j].r;
      if (dist <= Math.abs(k) + EPS) continue; // one circle contains the other: no outer tangent
      const phi = Math.acos(k / dist);
      const psiJ = Math.atan2(dy, dz) - phi; // outward normal of the tangent, right of the travel direction
      const delta = ccwDelta(psiJ - psi);
      if (delta < bestDelta - EPS || (Math.abs(delta - bestDelta) <= EPS && dist > bestDist)) {
        next = j;
        bestDelta = delta;
        bestPsi = psiJ;
        bestDist = dist;
      }
    }

    wrapped.push(cur);
    if (next < 0) {
      // a single circle bounds everything: the loop is that circle
      pieces.push({ s0: s, length: TWO_PI * c[cur].r, circle: cur, psi0: psi });
      s += TWO_PI * c[cur].r;
      break;
    }
    const arc = bestDelta * c[cur].r;
    if (arc > 0) {
      pieces.push({ s0: s, length: arc, circle: cur, psi0: psi });
      s += arc;
    }
    const nz = Math.cos(bestPsi);
    const ny = Math.sin(bestPsi);
    const z0 = c[cur].z + c[cur].r * nz;
    const y0 = c[cur].y + c[cur].r * ny;
    const z1 = c[next].z + c[next].r * nz;
    const y1 = c[next].y + c[next].r * ny;
    const len = Math.hypot(z1 - z0, y1 - y0);
    // direction of travel: normal rotated by +90° (outside is to the right of it)
    pieces.push({ s0: s, length: len, z0, y0, tz: -ny, ty: nz });
    s += len;
    cur = next;
    psi = bestPsi;
    if (cur === start) {
      // close the loop: the rest of the arc on the start circle, up to the point where the loop began
      const closing = ccwDelta(-Math.PI / 2 - psi) * c[start].r;
      if (closing > 0) {
        pieces.push({ s0: s, length: closing, circle: start, psi0: psi });
        s += closing;
      }
      break;
    }
  }
  const length = s;

  return {
    length,
    wrapped,
    at(dist: number, out: ChainPose = { z: 0, y: 0, angle: 0 }): ChainPose {
      let d = ((dist % length) + length) % length;
      // few pieces (≤ 2 per wheel): linear search
      let p = pieces[pieces.length - 1];
      for (let i = 0; i < pieces.length; i++) {
        if (d < pieces[i].s0 + pieces[i].length) {
          p = pieces[i];
          break;
        }
      }
      d -= p.s0;
      if (p.circle !== undefined) {
        const w = c[p.circle];
        const a = p.psi0! + d / w.r;
        out.z = w.z + w.r * Math.cos(a);
        out.y = w.y + w.r * Math.sin(a);
        out.angle = a + Math.PI / 2;
      } else {
        out.z = p.z0! + p.tz! * d;
        out.y = p.y0! + p.ty! * d;
        out.angle = Math.atan2(p.ty!, p.tz!);
      }
      return out;
    },
  };
}

/** Number of links and their spacing along a loop */
export interface LinkLayout {
  count: number;
  /** distance between link centres [m], close to the nominal pitch */
  pitch: number;
}

/**
 * A whole number of links that fills the loop: the nominal pitch is adjusted slightly so the last link meets the first.
 * At least 3 links, so the chain never degenerates.
 */
export function linkLayout(loopLength: number, nominalPitch: number): LinkLayout {
  if (!(nominalPitch > 0)) throw new Error('linkLayout: pitch must be > 0');
  const count = Math.max(3, Math.round(loopLength / nominalPitch));
  return { count, pitch: loopLength / count };
}
