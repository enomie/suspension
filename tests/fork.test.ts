import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { Vehicle } from '../src/physics/vehicle/Vehicle';
import { motorcycle } from '../src/physics/vehicle/presets/motorcycle';
import type { DriverInput } from '../src/physics/vehicle/types';

await RAPIER.init();

const DT = 1 / 120;
const idle: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

/** the bike cannot balance yet: lock the roll axis (world Z, the bike points along −Z) to test the suspension alone */
function setup() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 8;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setFriction(0.95), ground);
  const v = new Vehicle(RAPIER, world, motorcycle, { x: 0, y: 0.6, z: 0 });
  v.chassis.setEnabledRotations(true, true, false, true);
  const run = (seconds: number, input: DriverInput = idle) => {
    for (let i = 0; i < seconds / DT; i++) {
      v.applyInput(input, DT);
      world.step();
    }
    v.updateTelemetry();
  };
  return { v, run };
}

const rot = (q: { x: number; y: number; z: number; w: number }, p: { x: number; y: number; z: number }) => {
  // p rotated by quaternion q
  const { x, y, z, w } = q;
  const tx = 2 * (y * p.z - z * p.y);
  const ty = 2 * (z * p.x - x * p.z);
  const tz = 2 * (x * p.y - y * p.x);
  return { x: p.x + w * tx + (y * tz - z * ty), y: p.y + w * ty + (z * tx - x * tz), z: p.z + w * tz + (x * ty - y * tx) };
};

describe('telescopic fork', () => {
  it('settles at design ride, both wheels on the ground', () => {
    const { v, run } = setup();
    run(4);
    for (const c of v.corners) expect(Math.abs(c.telemetry.travel)).toBeLessThan(0.05);
    const lv = v.chassis.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.1);
    for (const c of v.corners) expect(c.wheel.translation().y).toBeCloseTo(motorcycle.axles[0].wheel.radius, 1);
  });

  it('has the configured rake and trail', () => {
    const { v, run } = setup();
    run(2);
    run(1.5, { ...idle, steer: 1 });
    const front = v.corners[0];
    const steer = front.joints.steer!;
    // steering axis = rotation axis of the knuckle relative to the stanchion
    const c = front.carrier.rotation();
    const k = front.knuckle!.rotation();
    const ci = { x: -c.x, y: -c.y, z: -c.z, w: c.w };
    const rel = {
      w: ci.w * k.w - ci.x * k.x - ci.y * k.y - ci.z * k.z,
      x: ci.w * k.x + ci.x * k.w + ci.y * k.z - ci.z * k.y,
      y: ci.w * k.y - ci.x * k.z + ci.y * k.w + ci.z * k.x,
      z: ci.w * k.z + ci.x * k.y - ci.y * k.x + ci.z * k.w,
    };
    const n = Math.hypot(rel.x, rel.y, rel.z);
    const axis = rot(c, { x: rel.x / n, y: rel.y / n, z: rel.z / n });
    const anchor1 = steer.anchor1();
    const origin = front.carrier.translation();
    const a = rot(c, anchor1);
    const point = { x: origin.x + a.x, y: origin.y + a.y, z: origin.z + a.z };
    // rake: angle of the axis from vertical (top leans back = +Z)
    const sign = axis.y < 0 ? -1 : 1;
    const dir = { x: axis.x * sign, y: axis.y * sign, z: axis.z * sign };
    expect(Math.atan2(dir.z, dir.y)).toBeCloseTo(0.45, 1);
    // trail: where the axis meets the ground vs. the contact point (ball wheel: straight below its center)
    const t = -point.y / dir.y; // ground at y = 0
    const axisGroundZ = point.z + dir.z * t;
    const contactZ = front.wheel.translation().z;
    expect(contactZ - axisGroundZ).toBeCloseTo(0.1, 1);
  });

  it('steers about the raked axis', () => {
    const { v, run } = setup();
    run(2);
    run(1.5, { ...idle, steer: 1 });
    const front = v.corners[0];
    expect(front.telemetry.steerAngle).toBeGreaterThan(0.3);
    // wheel yaws left: its spin axis (chassis −X) rotates toward the front
    const q = front.wheel.rotation();
    const spin = rot(q, { x: -1, y: 0, z: 0 });
    expect(Math.abs(spin.z)).toBeGreaterThan(0.2);
  });

  it('compresses along the axis under load and respects the travel limits', () => {
    const { v, run } = setup();
    run(3);
    v.chassis.addForce({ x: 0, y: -3000, z: 0 }, true);
    run(0.5);
    const t = v.corners[0].telemetry.travel;
    expect(t).toBeLessThan(-0.02);
    expect(t).toBeGreaterThan(-0.2);
  });

  it('drives forward and steers left', () => {
    const { v, run } = setup();
    run(1);
    run(3, { ...idle, throttle: 1 });
    expect(v.forwardSpeed).toBeGreaterThan(5);
    run(1.5, { ...idle, throttle: 0.4, steer: 1 });
    expect(v.chassis.translation().x).toBeLessThan(-0.3);
  });
});
