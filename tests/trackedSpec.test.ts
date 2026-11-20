import { describe, expect, it } from 'vitest';
import { TRACKED_LIMITS, validateTrackedSpec, type TrackedVehicleSpec } from '../src/shared/trackedSpec';
import type { AxleSpec } from '../src/shared/vehicleSpec';

const axle = (z: number): AxleSpec => ({
  z,
  track: 2,
  y: 0,
  suspension: 'strut',
  spring: { frequencyHz: 1.5, dampingRatio: 0.5, travel: [-0.15, 0.15] },
  wheel: { radius: 0.3, width: 0.4, mass: 20, friction: 1, shape: 'cylinder' },
  brake: { torque: 1000 },
});

function spec(): TrackedVehicleSpec {
  return {
    type: 'tracked',
    name: 'tank',
    chassis: { size: [2.4, 0.6, 5], mass: 12000 },
    axles: [axle(-1.2), axle(0), axle(1.2)],
    idler: { z: -2.2, y: 0.1, radius: 0.3, width: 0.4 },
    sprocket: { z: 2.2, y: 0.2, radius: 0.35, width: 0.4 },
    track: 2,
    beltWidth: 0.4,
    chainThickness: 0.05,
    linkAsset: 'Drive_Chain_Link',
    drive: { maxTorque: 8000, maxPower: 300, reverseSpeed: 5 },
  };
}

describe('validateTrackedSpec', () => {
  it('accepts a valid spec', () => {
    expect(validateTrackedSpec(spec())).toEqual([]);
  });

  it('accepts 2 and 5 road axles, rejects 1 and 6', () => {
    const s = spec();
    s.axles = [axle(-0.7), axle(0.7)];
    expect(validateTrackedSpec(s)).toEqual([]);
    s.axles = [-2.4, -1.2, 0, 1.2, 2.4].map(axle);
    s.idler.z = -3.4;
    s.sprocket.z = 3.4;
    expect(validateTrackedSpec(s)).toEqual([]);
    s.axles = [axle(0)];
    expect(validateTrackedSpec(s).join()).toContain(`need ${TRACKED_LIMITS.axles[0]}`);
    s.axles = [-3.6, -2.4, -1.2, 0, 1.2, 2.4].map(axle);
    expect(validateTrackedSpec(s).join()).toContain('6 road axles');
  });

  it('allows a raised idler and sprocket', () => {
    const s = spec();
    s.idler.y = 0.9;
    s.sprocket.y = 1.1;
    expect(validateTrackedSpec(s)).toEqual([]);
    s.sprocket.y = 2;
    expect(validateTrackedSpec(s).join()).toContain('sprocket: y');
  });

  it('requires front-to-back axle order without overlapping wheels', () => {
    const s = spec();
    s.axles = [axle(0), axle(-1.2)];
    expect(validateTrackedSpec(s).join()).toContain('behind axle 0');
    s.axles = [axle(-0.2), axle(0.2)];
    expect(validateTrackedSpec(s).join()).toContain('overlap');
  });

  it('puts the idler in front and the sprocket behind the road wheels', () => {
    const s = spec();
    s.idler.z = -1.3;
    expect(validateTrackedSpec(s).join()).toContain('idler must sit in front');
    const t = spec();
    t.sprocket.z = 1.3;
    expect(validateTrackedSpec(t).join()).toContain('sprocket must sit behind');
  });

  it('allows only unsteered strut road axles with a wheel pair', () => {
    const s = spec();
    s.axles[0].suspension = 'solidAxle';
    s.axles[1].steer = { maxAngle: 0.5 };
    s.axles[2].track = 0;
    const msg = validateTrackedSpec(s).join('\n');
    expect(msg).toContain("axle 0: suspension must be 'strut'");
    expect(msg).toContain('axle 1: road axles do not steer');
    expect(msg).toContain('axle 2: track must be > 0');
  });

  it('rejects overlapping tracks, bad belt values and a missing link asset', () => {
    const s = spec();
    s.track = 0.3;
    s.chainThickness = 0.5;
    s.linkAsset = '';
    const msg = validateTrackedSpec(s).join('\n');
    expect(msg).toContain('tracks would overlap');
    expect(msg).toContain('chainThickness');
    expect(msg).toContain('linkAsset');
  });

  it('checks the turn speed when given', () => {
    const s = spec();
    s.turnSpeed = 2.5;
    expect(validateTrackedSpec(s)).toEqual([]);
    s.turnSpeed = 20;
    expect(validateTrackedSpec(s).join()).toContain('turnSpeed');
  });

  it('checks end wheel radius and width limits', () => {
    const s = spec();
    s.idler.radius = 0.01;
    s.sprocket.width = 2;
    const msg = validateTrackedSpec(s).join('\n');
    expect(msg).toContain('idler: radius');
    expect(msg).toContain('sprocket: width');
  });
});
