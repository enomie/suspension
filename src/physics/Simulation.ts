import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { createPhysicsWorld } from './rapier';
import { PhysicsTiles } from './terrainColliders';
import { createVehicle } from './vehicle/createVehicle';
import type { SimVehicle } from './vehicle/simVehicle';
import { describeLayout, poseBodies } from './vehicle/layout';
import { ALL_PRESETS } from './vehicle/presets';
import { sampleTerrainHeightWorld } from '../shared/terrainHeight';
import { ORIGIN } from '../shared/origin';
import { OriginShifter } from '../shared/originShifter';
import { PHYSICS_DT, PHYSICS_SUBSTEPS } from '../shared/stepClock';
import { writeVehicleSnapshot } from './vehicle/snapshot';
import { neutralInput, type DriverInput } from '../shared/driverInput';
import type { AnyVehicleSpec } from '../shared/anyVehicleSpec';
import type { VehicleLayout } from '../shared/vehicleLayout';
import { addLogColliders } from './testLogs';
import { buildLogField } from '../shared/testLogs';
import { setTerrain, type TerrainConfig } from '../shared/terrain';

/**
 * Full physics (Rapier world, ground colliders, vehicle, own floating origin).
 * Runs in the physics worker — or as fallback on the main thread. No rendering.
 */
export class Simulation {
  readonly world: RAPIER.World;
  readonly tiles: PhysicsTiles;
  readonly origin = new OriginShifter();
  vehicle: SimVehicle;
  layout: VehicleLayout;
  private bodies: RAPIER.RigidBody[];
  gen = 0;
  preset: number;
  input: DriverInput = neutralInput();

  constructor(
    private R: typeof RAPIER,
    opts: { preset: number; x: number; z: number; terrain?: TerrainConfig; testLogs?: boolean },
  ) {
    if (opts.terrain) setTerrain(opts.terrain);
    ORIGIN.x = opts.x;
    ORIGIN.z = opts.z;
    this.world = createPhysicsWorld(R);
    this.world.timestep = PHYSICS_DT / PHYSICS_SUBSTEPS;
    this.world.numSolverIterations = 8;
    this.tiles = new PhysicsTiles(R, this.world);
    if (opts.testLogs) addLogColliders(R, this.world, buildLogField(opts.x, opts.z));
    // origin shift: move all Rapier bodies together (joints are relative → stay valid)
    this.origin.on((dx, dz) =>
      this.world.forEachRigidBody((b) => {
        const p = b.translation();
        b.setTranslation({ x: p.x - dx, y: p.y, z: p.z - dz }, false);
      }),
    );
    this.preset = Math.max(0, Math.min(ALL_PRESETS.length - 1, opts.preset));
    const spec = ALL_PRESETS[this.preset];
    this.vehicle = createVehicle(R, this.world, spec, this.spawnPoint(0, 0));
    this.bodies = poseBodies(this.vehicle.built);
    this.layout = describeLayout(spec, this.vehicle.built);
  }

  private spawnPoint(lx: number, lz: number) {
    this.tiles.update(lx, lz);
    return { x: lx, y: sampleTerrainHeightWorld(lx + ORIGIN.x, lz + ORIGIN.z) + 1.2, z: lz };
  }

  /** New vehicle (preset) at current position; new generation */
  spawn(preset = this.preset, custom?: AnyVehicleSpec): void {
    if (!custom && (preset < 0 || preset >= ALL_PRESETS.length)) return;
    const t = this.vehicle.chassis.translation();
    this.vehicle.dispose();
    this.preset = custom ? -1 : preset;
    const spec = custom ?? ALL_PRESETS[preset];
    this.vehicle = createVehicle(this.R, this.world, spec, this.spawnPoint(t.x, t.z));
    this.bodies = poseBodies(this.vehicle.built);
    this.layout = describeLayout(spec, this.vehicle.built);
    this.gen++;
  }

  step(): void {
    const v = this.vehicle;
    const t = v.chassis.translation();
    this.tiles.update(t.x, t.z, 2500); // neighbour tiles incrementally: ~2500 samples (~2.5 ms) per step
    // PHYSICS_SUBSTEPS solver steps per tick (see stepClock.ts): wheels may spin faster, i.e. vehicles may drive faster
    for (let i = 0; i < PHYSICS_SUBSTEPS; i++) {
      v.applyInput(this.input, PHYSICS_DT / PHYSICS_SUBSTEPS);
      this.world.step();
    }
    v.updateTelemetry();
    const c = v.chassis.translation();
    this.origin.update(c.x, c.z);
  }

  /** state as snapshot (layout: shared/snapshot.ts) */
  snapshot(stamp: number): Float64Array {
    return writeVehicleSnapshot(this.vehicle, this.bodies, { gen: this.gen, stamp, origin: ORIGIN });
  }

}
