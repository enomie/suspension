import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { createPhysicsWorld } from './rapier';
import { PhysicsTiles } from './terrainColliders';
import { Vehicle } from './vehicle/Vehicle';
import { describeLayout, poseBodies } from './vehicle/layout';
import { PRESETS } from './vehicle/presets';
import { sampleTerrainHeightWorld } from '../shared/terrainHeight';
import { ORIGIN } from '../shared/origin';
import { OriginShifter } from '../shared/originShifter';
import { PHYSICS_DT } from '../shared/stepClock';
import { writeVehicleSnapshot } from './vehicle/snapshot';
import type { DriverInput } from '../shared/vehicleSpec';
import type { VehicleLayout } from '../shared/vehicleLayout';
import { setTerrain, type TerrainConfig } from '../shared/terrain';

/**
 * Komplette Physik (Rapier-Welt, Boden-Collider, Fahrzeug, eigener Floating Origin).
 * Läuft im Physik-Worker – oder als Fallback im Haupt-Thread. Kennt kein Rendering.
 */
export class Simulation {
  readonly world: RAPIER.World;
  readonly tiles: PhysicsTiles;
  readonly origin = new OriginShifter();
  vehicle: Vehicle;
  layout: VehicleLayout;
  private bodies: RAPIER.RigidBody[];
  gen = 0;
  preset: number;
  input: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  constructor(
    private R: typeof RAPIER,
    opts: { preset: number; x: number; z: number; terrain?: TerrainConfig },
  ) {
    if (opts.terrain) setTerrain(opts.terrain);
    ORIGIN.x = opts.x;
    ORIGIN.z = opts.z;
    this.world = createPhysicsWorld(R);
    this.world.timestep = PHYSICS_DT;
    this.world.numSolverIterations = 8;
    this.tiles = new PhysicsTiles(R, this.world);
    // Origin-Shift: alle Rapier-Körper mitverschieben (Joints sind relativ → bleiben gültig)
    this.origin.on((dx, dz) =>
      this.world.forEachRigidBody((b) => {
        const p = b.translation();
        b.setTranslation({ x: p.x - dx, y: p.y, z: p.z - dz }, false);
      }),
    );
    this.preset = Math.max(0, Math.min(PRESETS.length - 1, opts.preset));
    this.vehicle = new Vehicle(R, this.world, PRESETS[this.preset], this.spawnPoint(0, 0));
    this.bodies = poseBodies(this.vehicle.built);
    this.layout = describeLayout(this.vehicle.spec, this.vehicle.built);
  }

  private spawnPoint(lx: number, lz: number) {
    this.tiles.update(lx, lz);
    return { x: lx, y: sampleTerrainHeightWorld(lx + ORIGIN.x, lz + ORIGIN.z) + 1.2, z: lz };
  }

  /** Neues Fahrzeug (Preset) an aktueller Position; neue Generation */
  spawn(preset = this.preset): void {
    if (preset < 0 || preset >= PRESETS.length) return;
    const t = this.vehicle.chassis.translation();
    this.vehicle.dispose();
    this.preset = preset;
    this.vehicle = new Vehicle(this.R, this.world, PRESETS[preset], this.spawnPoint(t.x, t.z));
    this.bodies = poseBodies(this.vehicle.built);
    this.layout = describeLayout(this.vehicle.spec, this.vehicle.built);
    this.gen++;
  }

  step(): void {
    const v = this.vehicle;
    const t = v.chassis.translation();
    this.tiles.update(t.x, t.z, 2500); // Nachbarkacheln stückweise: ~2500 Punkte (~2,5 ms) pro Schritt
    v.applyInput(this.input, PHYSICS_DT);
    this.world.step();
    v.updateTelemetry();
    const c = v.chassis.translation();
    this.origin.update(c.x, c.z);
  }

  /** Zustand als Snapshot (Layout: shared/snapshot.ts) */
  snapshot(stamp: number): Float64Array {
    return writeVehicleSnapshot(this.vehicle, this.bodies, { gen: this.gen, stamp, origin: ORIGIN });
  }

}
