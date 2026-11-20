import { describe, expect, it } from 'vitest';
import {
  CUSTOM_TRACKED_LIMITS,
  DEFAULT_CUSTOM_TRACKED,
  buildTrackedSpec,
  trackedConfigFromSpec,
  type CustomTrackedConfig,
} from '../src/shared/customTracked';
import { validateTrackedSpec } from '../src/shared/trackedSpec';
import { tank } from '../src/physics/vehicle/presets/tracked';

const config = (o: Partial<CustomTrackedConfig> = {}): CustomTrackedConfig => ({ ...structuredClone(DEFAULT_CUSTOM_TRACKED), ...o });
const L = CUSTOM_TRACKED_LIMITS;

describe('buildTrackedSpec', () => {
  it('the default config gives a valid spec', () => {
    const spec = buildTrackedSpec(DEFAULT_CUSTOM_TRACKED);
    expect(validateTrackedSpec(spec)).toEqual([]);
    expect(spec.type).toBe('tracked');
    expect(spec.axles).toHaveLength(4);
  });

  it('spaces the road axles evenly around the chassis origin, idler in front and sprocket behind', () => {
    const spec = buildTrackedSpec(config({ roadAxles: 3, wheelbase: 2.4 }));
    expect(spec.axles.map((a) => a.z)).toEqual([-1.2, 0, 1.2]);
    expect(spec.idler.z).toBeCloseTo(-1.2 - 0.9, 9);
    expect(spec.sprocket.z).toBeCloseTo(1.2 + 0.9, 9);
  });

  it('the wheelbase is the distance from the first to the last road axle', () => {
    const spec = buildTrackedSpec(config({ roadAxles: 4, wheelbase: 4.5 }));
    expect(spec.axles[3].z - spec.axles[0].z).toBeCloseTo(4.5, 9);
  });

  it('the collider box adds the low friction block, like a wheeled vehicle, and round-trips', () => {
    const on = buildTrackedSpec(config({ colliderBox: true }));
    expect(on.chassis.lowerCollider?.friction).toBeLessThan(0.3);
    expect(buildTrackedSpec(config({ colliderBox: false })).chassis.lowerCollider).toBeUndefined();
    expect(trackedConfigFromSpec(on).colliderBox).toBe(true);
    expect(trackedConfigFromSpec(buildTrackedSpec(config({ colliderBox: false }))).colliderBox).toBe(false);
  });

  it('raises the idler and sprocket above the road wheel centres', () => {
    const spec = buildTrackedSpec(config({ idler: { ...DEFAULT_CUSTOM_TRACKED.idler, raise: 0.6 } }));
    expect(spec.idler.y - spec.axles[0].y).toBeCloseTo(0.6, 9);
  });

  it('every limit corner is a valid spec', () => {
    const corners: Partial<CustomTrackedConfig>[] = [
      { roadAxles: L.roadAxles[0], wheelbase: L.wheelbase[0], wheelRadius: L.wheelRadius[1] },
      { roadAxles: L.roadAxles[1], wheelbase: L.wheelbase[1], wheelRadius: L.wheelRadius[0] },
      { track: L.track[0], beltWidth: L.beltWidth[1] },
      { track: L.track[1], beltWidth: L.beltWidth[0] },
      { idler: { distance: L.endDistance[0], raise: L.endRaise[0], radius: L.endRadius[1], width: L.endWidth[1] } },
      { sprocket: { distance: L.endDistance[0], raise: L.endRaise[1], radius: L.endRadius[1], width: L.endWidth[0] } },
      { weight: L.weight[0], torque: L.torque[0], power: L.power[0], turnSpeed: L.turnSpeed[0] },
      { weight: L.weight[1], torque: L.torque[1], power: L.power[1], turnSpeed: L.turnSpeed[1], chainThickness: L.chainThickness[1] },
    ];
    for (const c of corners) expect(validateTrackedSpec(buildTrackedSpec(config(c)))).toEqual([]);
  });

  it('allows extreme engine power (15 000 kW and more)', () => {
    expect(L.power[1]).toBeGreaterThanOrEqual(15000);
    const spec = buildTrackedSpec(config({ power: 15000 }));
    expect(validateTrackedSpec(spec)).toEqual([]);
    expect(spec.drive.maxPower).toBe(15_000_000);
  });

  it('corrects values outside the limits instead of rejecting them', () => {
    const spec = buildTrackedSpec(config({ roadAxles: 99, wheelRadius: 5, track: 0, beltWidth: 50, weight: 1, torque: 0, power: 0 }));
    expect(validateTrackedSpec(spec)).toEqual([]);
    expect(spec.axles).toHaveLength(L.roadAxles[1]);
    expect(spec.axles[0].wheel.radius).toBe(L.wheelRadius[1]);
  });

  it('keeps neighbouring wheels apart: spacing grows with a big wheel', () => {
    const spec = buildTrackedSpec(config({ wheelbase: 0.6, wheelRadius: 0.6 }));
    expect(spec.axles[1].z - spec.axles[0].z).toBeGreaterThanOrEqual(1.2);
  });

  it('the total weight is the chassis plus the road wheels', () => {
    const spec = buildTrackedSpec(config({ weight: 20000 }));
    const wheels = spec.axles.reduce((m, a) => m + 2 * a.wheel.mass, 0);
    expect(spec.chassis.mass + wheels).toBeCloseTo(20000, 6);
  });
});

describe('trackedConfigFromSpec', () => {
  it('round trip: the tracked preset gives the same vehicle', () => {
    const rebuilt = buildTrackedSpec(trackedConfigFromSpec(tank));
    expect(rebuilt.axles.map((a) => a.z)).toEqual(tank.axles.map((a) => a.z));
    expect(rebuilt.axles[0].wheel.radius).toBe(tank.axles[0].wheel.radius);
    expect(rebuilt.idler).toMatchObject({ radius: tank.idler.radius, width: tank.idler.width });
    expect(rebuilt.idler.z).toBeCloseTo(tank.idler.z, 9);
    expect(rebuilt.idler.y).toBeCloseTo(tank.idler.y, 9);
    expect(rebuilt.sprocket.z).toBeCloseTo(tank.sprocket.z, 9);
    expect(rebuilt.sprocket.y).toBeCloseTo(tank.sprocket.y, 9);
    expect(rebuilt.track).toBe(tank.track);
    expect(rebuilt.beltWidth).toBe(tank.beltWidth);
    expect(rebuilt.chassis.mass).toBeCloseTo(tank.chassis.mass, 6);
    expect(rebuilt.chassis.size).toEqual(tank.chassis.size);
    expect(rebuilt.drive.maxTorque).toBe(tank.drive.maxTorque);
    expect(rebuilt.drive.maxPower).toBe(tank.drive.maxPower);
  });

  it('the panel default is the tracked preset', () => {
    expect(trackedConfigFromSpec(tank)).toEqual(DEFAULT_CUSTOM_TRACKED);
  });
});
