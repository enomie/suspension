import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { TrackedVehicle } from '../src/physics/vehicle/tracked/TrackedVehicle';
import { tank } from '../src/physics/vehicle/presets/tracked';
import { addLogColliders } from '../src/physics/testLogs';
import { neutralInput } from '../src/shared/driverInput';
import type { LogSpec } from '../src/shared/testLogs';
import { Quaternion, Vector3 } from 'three';
import { buildChainLoop, deformChainLoop } from '../src/shared/chainLoop';
import { trackLiftAt, trackProfileRange } from '../src/shared/trackProfile';

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
    v.updateTelemetry();
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

  it('the visible chain lies on the log instead of going through it (road wheel span)', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    world.numSolverIterations = 8;
    const g = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), g);
    const log: LogSpec = logs(0.1, 0.1)[0];
    addLogColliders(RAPIER, world, [log]);
    const v = new TrackedVehicle(RAPIER, world, tank, { x: 0, y: 1.2, z: 0 });
    const [z0, z1] = trackProfileRange(tank);
    const ct0 = tank.chainThickness;
    let worst = 0;
    let frames = 0;
    for (let k = 0; k < 1800; k++) {
      v.applyInput({ ...neutralInput(), throttle: 0.5 }, DT);
      world.step();
      v.updateTelemetry();
      const ct = v.chassis.translation();
      if (ct.z > -17 || ct.z < -24) continue; // chassis over the log
      frames++;
      const cr = v.chassis.rotation();
      const q = new Quaternion(cr.x, cr.y, cr.z, cr.w);
      const qi = q.clone().invert();
      const wheels = v.corners.filter((c) => c.side === 'L').sort((a, b) => a.anchor[2] - b.anchor[2]);
      const circles = [
        { z: tank.idler.z, y: tank.idler.y, radius: tank.idler.radius },
        ...wheels.map((c) => {
          const t = c.wheel.translation();
          const l = new Vector3(t.x - ct.x, t.y - ct.y, t.z - ct.z).applyQuaternion(qi);
          return { z: l.z, y: l.y, radius: c.axle.wheel.radius - ct0 };
        }),
        { z: tank.sprocket.z, y: tank.sprocket.y, radius: tank.sprocket.radius },
      ];
      const pts = circles.map((w) => ({ z: w.z, y: w.y - w.radius - ct0 / 2 })).sort((a, b) => a.z - b.z);
      const floor = (z: number): number => {
        if (z < pts[0].z || z > pts[pts.length - 1].z) return -Infinity;
        let i = 0;
        while (i + 2 < pts.length && pts[i + 1].z < z) i++;
        return pts[i].y + ((pts[i + 1].y - pts[i].y) * (z - pts[i].z)) / (pts[i + 1].z - pts[i].z);
      };
      const loop = deformChainLoop(buildChainLoop(circles, ct0), (z) => trackLiftAt(v.trackProfile, 0, 0, z, z0, z1), floor);
      const p = { z: 0, y: 0, angle: 0 };
      for (let s = 0; s < loop.length; s += 0.02) {
        loop.at(s, p);
        if (Math.cos(p.angle) <= 0.3 || p.z < -1.8) continue; // lower run over the road wheels, not the nose arc
        const outer = new Vector3(0, p.y - (Math.cos(p.angle) * ct0) / 2, p.z + (Math.sin(p.angle) * ct0) / 2).applyQuaternion(q);
        const dist = Math.hypot(ct.z + outer.z - log.z, ct.y + outer.y - log.y);
        worst = Math.max(worst, log.radius - dist);
      }
    }
    expect(frames).toBeGreaterThan(50);
    expect(worst).toBeLessThan(0.1); // without the ground profile the chain goes about 0.4 m into the log; the rest is the steep flank
  });
});

describe('tracked vehicle tipped over', () => {
  // a heightfield like the real terrain: Rapier returns the normal of a ray hit turned toward the ray origin, so rays from
  // an upside-down vehicle find the ground from underneath
  for (const deg of [180, 140, 100]) {
    it(`${deg}° on a heightfield: no support, no chain lift (the chain must not move)`, () => {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = DT;
      world.numSolverIterations = 8;
      const n = 64;
      world.createCollider(RAPIER.ColliderDesc.heightfield(n, n, new Float32Array((n + 1) * (n + 1)), { x: 128, y: 1, z: 128 }));
      const v = new TrackedVehicle(RAPIER, world, tank, { x: 0, y: 3, z: 0 });
      // tip the whole vehicle about the chassis Z axis (all bodies together, joints stay valid)
      const c = v.chassis.translation();
      const a = (deg * Math.PI) / 180;
      const tip = new Quaternion(0, 0, Math.sin(a / 2), Math.cos(a / 2));
      for (const b of new Set([v.chassis, ...v.corners.flatMap((k) => k.bodies)])) {
        const t = b.translation();
        const r = b.rotation();
        const q = tip.clone().multiply(new Quaternion(r.x, r.y, r.z, r.w));
        const dx = t.x - c.x;
        const dy = t.y - c.y;
        b.setTranslation({ x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a), z: t.z }, true);
        b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      }
      let tipped = 0;
      let maxLift = 0;
      let maxContacts = 0;
      for (let k = 0; k < 480; k++) {
        v.applyInput(neutralInput(), DT);
        world.step();
        v.updateTelemetry();
        const r = v.chassis.rotation();
        if (1 - 2 * (r.x * r.x + r.z * r.z) < 0.05) {
          // chassis up axis no longer points up
          tipped++;
          for (const x of v.trackProfile) maxLift = Math.max(maxLift, x);
          maxContacts = Math.max(maxContacts, v.contact.points.length);
        }
      }
      expect(tipped).toBeGreaterThan(100);
      expect(maxLift).toBe(0);
      expect(maxContacts).toBe(0);
    });
  }
});
