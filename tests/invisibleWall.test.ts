import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysicsTiles } from '../src/physics/terrainColliders';
import { sampleTerrainHeightWorld } from '../src/shared/terrainHeight';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { PRESETS } from '../src/physics/vehicle/presets';

await RAPIER.init();

/**
 * "Invisible wall": formerly the (invisible) full chassis box landed on ground waves
 * and snagged on triangle edges → deceleration down to −1000 m/s². Now collision = frame only.
 */
describe('no invisible wall', () => {
  for (const [i, spec] of PRESETS.entries()) {
    it(`${spec.name}: 20 s full throttle over wavy terrain without hard jolt`, () => {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = 1 / 120;
      world.numSolverIterations = 8;
      const tiles = new PhysicsTiles(RAPIER, world);
      tiles.update(0, 0);
      const v = new Vehicle(RAPIER, world, spec, { x: 0, y: sampleTerrainHeightWorld(0, 0) + 1.2, z: 0 });
      let prev = 0;
      let worst = 0;
      let chassisHits = 0;
      for (let k = 0; k < 120 * 20; k++) {
        const t = v.chassis.translation();
        tiles.update(t.x, t.z);
        v.applyInput({ throttle: 1, brake: 0, steer: k > 600 ? ((i % 3) - 1) * 0.3 : 0, handbrake: false }, 1 / 120);
        world.step();
        const lv = v.chassis.linvel();
        const sp = Math.hypot(lv.x, lv.z);
        if (k > 120) worst = Math.min(worst, (sp - prev) * 120);
        prev = sp;
        world.contactPairsWith(v.chassis.collider(0), (o) => {
          if (!o.parent()?.isFixed()) return;
          world.contactPair(v.chassis.collider(0), o, (m) => {
            if (m.numContacts() > 0) chassisHits++;
          });
        });
      }
      // frame may briefly land after jumps (twist beam over crest) but must not hang up
      expect(chassisHits).toBeLessThan(30);
      expect(worst).toBeGreaterThan(-300);
    }, 30000);
  }
});
