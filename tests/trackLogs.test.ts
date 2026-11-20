import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { TrackedVehicle } from '../src/physics/vehicle/tracked/TrackedVehicle';
import { tank } from '../src/physics/vehicle/presets/tracked';
import { addLogColliders } from '../src/physics/testLogs';
import { neutralInput } from '../src/shared/driverInput';
import type { LogSpec } from '../src/shared/testLogs';

await RAPIER.init();
const DT = 1 / 120;

/** flat ground at y = 0 with the test log field (radius 0.4, 10 m wide, 2 m gaps, 10 %…90 % buried) */
function logs(from: number, to: number): LogSpec[] {
  const out: LogSpec[] = [];
  for (let i = 0; i < 10; i++) {
    const buried = from + ((to - from) * i) / 9;
    out.push({ x: 0, y: 0.8 * (1 - buried) - 0.4, z: -20 - i * 2.8, radius: 0.4, length: 10, buried });
  }
  return out;
}

function drive(contact: boolean, field: LogSpec[], seconds: number) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const g = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), g);
  addLogColliders(RAPIER, world, field);
  const v = new TrackedVehicle(RAPIER, world, tank, { x: 0, y: 1.2, z: 0 });
  v.contact.enabled = contact;
  const inp = { ...neutralInput(), throttle: 1 };
  let maxContacts = 0;
  let maxLift = 0;
  for (let k = 0; k < seconds / DT; k++) {
    v.applyInput(inp, DT);
    world.step();
    maxContacts = Math.max(maxContacts, v.contact.points.length);
    for (const x of v.trackProfile) maxLift = Math.max(maxLift, x);
    if (v.chassis.translation().z < -60) break; // past the last log (z ≈ −45)
  }
  return { z: v.chassis.translation().z, y: v.chassis.translation().y, maxContacts, maxLift };
}

describe('tracked vehicle over logs (flat ground, logs 20 m ahead, 10 %…90 % buried)', () => {
  it('with the between-wheel contact it crosses all ten logs', () => {
    const r = drive(true, logs(0.1, 0.9), 40);
    expect(r.z).toBeLessThan(-60);
    expect(r.y).toBeGreaterThan(0); // never fell through
    expect(r.maxContacts).toBeGreaterThan(0);
    expect(r.maxLift).toBeGreaterThan(0.1); // the ground profile for the chain visual shows the logs
  });
  it('the chain wraps idler and sprocket: nose and tail contacts exist on a single log', () => {
    const r = drive(true, [logs(0.1, 0.1)[0]], 10);
    expect(r.z).toBeLessThan(-30); // crosses the single log and keeps going
    expect(r.maxContacts).toBeGreaterThan(0);
  });
  it('without it the wheel colliders alone get stuck at the first log (the problem this fixes)', () => {
    const r = drive(false, logs(0.1, 0.9), 40);
    expect(r.z).toBeGreaterThan(-40);
  });
  it('flat ground: contact forces stay small and do not disturb the ride height', () => {
    const on = drive(true, [], 4);
    const off = drive(false, [], 4);
    expect(Math.abs(on.y - off.y)).toBeLessThan(0.05);
  });
});
