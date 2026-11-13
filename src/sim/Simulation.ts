import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { createPhysicsWorld } from '../physics/rapierWorld';
import { PhysicsTiles } from '../terrain/physicsTiles';
import { sampleTerrainHeightWorld } from '../terrain/generateHeights';
import { ORIGIN } from '../world/origin';
import { OriginShifter } from '../world/originShift';
import { poseBodies, Vehicle } from '../vehicle/Vehicle';
import { PRESETS } from '../vehicle/presets';
import type { DriverInput } from '../vehicle/types';
import { BODY_STRIDE, CORNER_STRIDE, HEADER, snapshotLength } from './snapshot';

export const PHYSICS_DT = 1 / 120;

/**
 * Komplette Physik (Rapier-Welt, Boden-Kacheln, Fahrzeug, eigener Floating Origin).
 * Läuft im Physik-Worker – oder als Fallback im Haupt-Thread. Kennt kein three.js-Rendering.
 */
export class Simulation {
  readonly world: RAPIER.World;
  readonly tiles: PhysicsTiles;
  readonly origin: OriginShifter;
  vehicle: Vehicle;
  bodies: RAPIER.RigidBody[];
  gen = 0;
  preset: number;
  input: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  constructor(
    private R: typeof RAPIER,
    opts: { preset: number; x: number; z: number },
  ) {
    ORIGIN.x = opts.x;
    ORIGIN.z = opts.z;
    this.world = createPhysicsWorld(R);
    this.world.timestep = PHYSICS_DT;
    this.world.numSolverIterations = 8;
    this.tiles = new PhysicsTiles(R, this.world);
    this.origin = new OriginShifter(this.world);
    this.preset = opts.preset;
    this.vehicle = new Vehicle(R, this.world, PRESETS[this.preset], this.spawnPoint(0, 0));
    this.bodies = poseBodies(this.vehicle.built);
  }

  private spawnPoint(lx: number, lz: number) {
    this.tiles.update(lx, lz);
    return { x: lx, y: sampleTerrainHeightWorld(lx + ORIGIN.x, lz + ORIGIN.z) + 1.2, z: lz };
  }

  /** Neues Fahrzeug (Preset) an aktueller Position; neue Generation */
  spawn(preset = this.preset): void {
    const t = this.vehicle.chassis.translation();
    this.vehicle.dispose();
    this.preset = preset;
    this.vehicle = new Vehicle(this.R, this.world, PRESETS[preset], this.spawnPoint(t.x, t.z));
    this.bodies = poseBodies(this.vehicle.built);
    this.gen++;
  }

  step(): void {
    const v = this.vehicle;
    const t = v.chassis.translation();
    this.tiles.update(t.x, t.z);
    v.applyInput(this.input, PHYSICS_DT);
    this.world.step();
    v.updateTelemetry();
    const c = v.chassis.translation();
    this.origin.update(c.x, c.z);
  }

  snapshot(stamp: number): Float64Array {
    const v = this.vehicle;
    const s = new Float64Array(snapshotLength(v.corners.length, this.bodies.length));
    s[0] = this.gen;
    s[1] = stamp;
    s[2] = v.forwardSpeed;
    let o = HEADER;
    for (const c of v.corners) {
      const m = c.telemetry;
      s[o] = m.travel;
      s[o + 1] = m.springForce;
      s[o + 2] = m.wheelOmega;
      s[o + 3] = m.steerAngle;
      o += CORNER_STRIDE;
    }
    for (const b of this.bodies) {
      const p = b.translation();
      const r = b.rotation();
      s[o] = p.x + ORIGIN.x;
      s[o + 1] = p.y;
      s[o + 2] = p.z + ORIGIN.z;
      s[o + 3] = r.x;
      s[o + 4] = r.y;
      s[o + 5] = r.z;
      s[o + 6] = r.w;
      o += BODY_STRIDE;
    }
    return s;
  }
}

/**
 * Takt mit Wanduhr: Schritt n gehört zum Zeitpunkt start + n·dt. `due(now)` = wie viele Schritte jetzt fällig.
 * Nach Hängern (> maxSteps) wird die Uhr nachgezogen statt aufzuholen.
 */
export class StepClock {
  private start: number;
  n = 0;
  constructor(
    now: number,
    readonly dtMs = PHYSICS_DT * 1000,
    readonly maxSteps = 6,
  ) {
    this.start = now;
  }
  due(now: number): number {
    let k = Math.floor((now - this.start) / this.dtMs) - this.n;
    if (k > this.maxSteps) {
      this.start += (k - this.maxSteps) * this.dtMs;
      k = this.maxSteps;
    }
    return Math.max(0, k);
  }
  /** Zeitstempel nach dem nächsten Schritt */
  stampNext(): number {
    this.n++;
    return this.start + this.n * this.dtMs;
  }
  /** Zeitpunkt des nächsten fälligen Schritts */
  nextAt(): number {
    return this.start + (this.n + 1) * this.dtMs;
  }
}
