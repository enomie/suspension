import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { Quaternion, Vector3 } from 'three';

/**
 * Render-Interpolation zwischen zwei Physik-Schritten (fester Takt ≠ Bildrate).
 * `capture()` vor jedem world.step() merkt sich die Pose; beim Rendern wird mit
 * alpha = Rest-Akkumulator / dt zwischen vorheriger und aktueller Pose gemischt.
 */
export class PoseInterpolator {
  private index = new Map<number, number>();
  private prev: Float64Array;
  private valid = false;
  /** 0 = vorheriger Schritt, 1 = aktueller Schritt */
  alpha = 1;
  private _q0 = new Quaternion();
  private _q1 = new Quaternion();

  constructor(private bodies: RAPIER.RigidBody[]) {
    bodies.forEach((b, i) => this.index.set(b.handle, i));
    this.prev = new Float64Array(bodies.length * 7);
  }

  capture(): void {
    const p = this.prev;
    this.bodies.forEach((b, i) => {
      const t = b.translation();
      const r = b.rotation();
      p.set([t.x, t.y, t.z, r.x, r.y, r.z, r.w], i * 7);
    });
    this.valid = true;
  }

  /** Floating Origin: gespeicherte Posen mitverschieben */
  shift(dx: number, dz: number): void {
    for (let i = 0; i < this.bodies.length; i++) {
      this.prev[i * 7] -= dx;
      this.prev[i * 7 + 2] -= dz;
    }
  }

  position(b: RAPIER.RigidBody, out: Vector3): Vector3 {
    const t = b.translation();
    const i = this.index.get(b.handle);
    if (!this.valid || i === undefined) return out.set(t.x, t.y, t.z);
    const p = this.prev;
    const a = this.alpha;
    const o = i * 7;
    return out.set(p[o] + (t.x - p[o]) * a, p[o + 1] + (t.y - p[o + 1]) * a, p[o + 2] + (t.z - p[o + 2]) * a);
  }

  rotation(b: RAPIER.RigidBody, out: Quaternion): Quaternion {
    const r = b.rotation();
    const i = this.index.get(b.handle);
    if (!this.valid || i === undefined) return out.set(r.x, r.y, r.z, r.w);
    const o = i * 7;
    const p = this.prev;
    this._q0.set(p[o + 3], p[o + 4], p[o + 5], p[o + 6]);
    this._q1.set(r.x, r.y, r.z, r.w);
    return out.slerpQuaternions(this._q0, this._q1, this.alpha);
  }
}

export type PoseSource = Pick<PoseInterpolator, 'position' | 'rotation'>;
