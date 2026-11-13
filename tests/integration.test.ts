import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
// NUR öffentliche Einstiege – so sieht die Einbindung in einem anderen Projekt aus (ohne Worker)
import { Vehicle, PRESETS, describeLayout, poseBodies, writeVehicleSnapshot, makeCar } from '../src/physics/vehicle';
import { VehicleVisual } from '../src/render/vehicle';
import { createTerrain, HILLS_TERRAIN } from '../src/shared/terrain';

await RAPIER.init();

describe('Integration ohne Worker (Minimalbeispiel aus src/docs/INTEGRATION_VEHICLE.md)', () => {
  it('eigener Boden + Fahrzeug + Optik im selben Thread', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    world.numSolverIterations = 8;
    // Boden: ein eigenes Heightfield aus dem Terrain-Generator (beliebige Quelle möglich)
    const terrain = createTerrain(HILLS_TERRAIN);
    const n = 128;
    const size = 64;
    const h = new Float32Array((n + 1) * (n + 1));
    for (let c = 0; c <= n; c++) for (let r = 0; r <= n; r++) h[c * (n + 1) + r] = terrain.height(-32 + c * 0.5, -32 + r * 0.5);
    world.createCollider(RAPIER.ColliderDesc.heightfield(n, n, h, { x: size, y: 1, z: size }).setFriction(0.95));

    const spec = PRESETS[2]; // McPherson
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: terrain.height(0, 0) + 1.2, z: 0 });
    const bodies = poseBodies(v.built);
    const visual = new VehicleVisual(describeLayout(spec, v.built));

    const input = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    for (let i = 0; i < 240; i++) {
      v.applyInput(input, 1 / 120);
      world.step();
      v.updateTelemetry();
    }
    visual.apply(writeVehicleSnapshot(v, bodies));
    expect(v.forwardSpeed).toBeGreaterThan(3);
    expect(visual.chassis.position.z).toBeLessThan(-2); // vorwärts = −Z
    expect(visual.root.visible).toBe(true);
  });

  it('eigenes Fahrzeug aus makeCar (z. B. aus einem Asset-Editor befüllt)', () => {
    const spec = makeCar('custom', 'Eigenbau', 'doubleWishbone');
    spec.chassis.mass = 900;
    spec.axles[0].wheel = { ...spec.axles[0].wheel, radius: 0.3 };
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0));
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 1, z: 0 });
    for (let i = 0; i < 360; i++) {
      v.applyInput({ throttle: 0, brake: 0, steer: 0, handbrake: false }, 1 / 120);
      world.step();
    }
    v.updateTelemetry();
    const lv = v.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.2);
  });
});

describe('Chassis-Collider aus Primitives (Asset-Editor)', () => {
  it('Box + Kugel als Collider, fährt und steht auf ebenem Boden', () => {
    const spec = makeCar('editor', 'Editor-Chassis', 'strut');
    spec.chassis.colliders = [
      { shape: 'box', position: [0, -0.1, 0], size: [1.0, 0.14, 4.2], rounded: 0.04 },
      { shape: 'sphere', position: [0, 0.2, -1.6], radius: 0.15 },
    ];
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0));
    const v = new Vehicle(RAPIER, world, spec, { x: 0, y: 1, z: 0 });
    expect(v.chassis.numColliders()).toBe(2);
    for (let i = 0; i < 480; i++) {
      v.applyInput({ throttle: i > 240 ? 1 : 0, brake: 0, steer: 0, handbrake: false }, 1 / 120);
      world.step();
    }
    expect(v.chassis.mass()).toBeCloseTo(spec.chassis.mass, 0); // Masse aus Spec, nicht aus den Primitives
    expect(v.forwardSpeed).toBeGreaterThan(3);
    const r = v.chassis.rotation();
    expect(Math.abs(r.x) + Math.abs(r.z)).toBeLessThan(0.1);
  });
});
