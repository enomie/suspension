import { describe, expect, it } from 'vitest';
import { BIKE_PRESETS, motorcycle } from '../src/physics/vehicle/presets/bike';
import { bikeComLimits, minBikeWheelbase, validateBikeSpec } from '../src/shared/bikeSpec';
import { CUSTOM_BIKE_LIMITS, DEFAULT_CUSTOM_BIKE, bikeConfigFromSpec, buildBikeSpec, type CustomBikeConfig } from '../src/shared/customBike';

const config = (c: Partial<CustomBikeConfig>): CustomBikeConfig => ({ ...structuredClone(DEFAULT_CUSTOM_BIKE), ...c });

describe('custom bike profile', () => {
  it('the default is the motorcycle preset (weight 180 kg)', () => {
    expect(DEFAULT_CUSTOM_BIKE.weight).toBe(180);
    expect(bikeConfigFromSpec(motorcycle)).toEqual(DEFAULT_CUSTOM_BIKE);
    const spec = buildBikeSpec(DEFAULT_CUSTOM_BIKE);
    expect(validateBikeSpec(spec)).toEqual([]);
    expect({ ...spec, name: motorcycle.name, label: motorcycle.label, drive: { ...spec.drive, maxSlipSpeed: undefined } }).toEqual({ ...motorcycle, drive: { ...motorcycle.drive, maxSlipSpeed: undefined } });
  });

  it.each(BIKE_PRESETS)('$name: preset → config → spec is valid, config → spec → config is unchanged', (preset) => {
    const c = bikeConfigFromSpec(preset);
    const spec = buildBikeSpec(c);
    expect(validateBikeSpec(spec)).toEqual([]);
    expect(bikeConfigFromSpec(spec)).toEqual(c);
    expect(spec.wheelbase).toBe(preset.wheelbase);
    expect([spec.front.radius, spec.front.width, spec.rear.radius, spec.rear.width]).toEqual([preset.front.radius, preset.front.width, preset.rear.radius, preset.rear.width]);
  });

  it('every field at its limits still gives a valid bike', () => {
    const L = CUSTOM_BIKE_LIMITS;
    for (const i of [0, 1] as const)
      for (const r of [L.wheelRadius[0], L.wheelRadius[1]])
        for (const w of [L.wheelWidth[0], L.wheelWidth[1]]) {
          const c = config({
            wheelbase: L.wheelbase[i],
            front: { radius: r, width: w },
            rear: { radius: L.wheelRadius[1 - i], width: w },
            weight: L.weight[i],
            comOffset: [L.comOffset.x[i], L.comOffset.y[i], L.comOffset.z[i]],
            torque: L.torque[i],
            power: L.power[i],
            rearBrakeTorque: L.rearBrakeTorque[i],
            wheelspin: L.wheelspin[i],
          });
          expect(validateBikeSpec(buildBikeSpec(c))).toEqual([]);
        }
  });

  it('grows the wheelbase until both wheels and the frame fit', () => {
    const spec = buildBikeSpec(config({ wheelbase: 0.5, front: { radius: 0.6, width: 0.36 }, rear: { radius: 0.6, width: 0.36 } }));
    expect(spec.wheelbase).toBeCloseTo(minBikeWheelbase(0.6, 0.6), 9);
    expect(spec.wheelbase).toBeGreaterThan(1.2);
  });

  it('keeps the tire width within 0.2…0.8 of the radius', () => {
    const spec = buildBikeSpec(config({ front: { radius: 0.3, width: 0.5 }, rear: { radius: 0.3, width: 0.01 } }));
    expect(spec.front.width).toBeCloseTo(0.24, 9);
    expect(spec.rear.width).toBeCloseTo(0.06, 9);
  });

  it('clamps the center of mass into the bike limits and keeps the weight above both wheels', () => {
    const spec = buildBikeSpec(config({ comOffset: [0.5, 0.6, 2], weight: 30, front: { radius: 1, width: 0.6 }, rear: { radius: 1, width: 0.6 }, wheelbase: 3 }));
    const L = bikeComLimits(spec);
    expect(spec.comOffset).toEqual([L.x[1], Math.min(0.6, L.y[1]), L.z[1]]);
    expect(spec.mass).toBeGreaterThan(spec.front.mass + spec.rear.mass);
  });

  it('wheelspin and power map onto the drive', () => {
    const spec = buildBikeSpec(config({ wheelspin: 6, power: 20, torque: 120, rearBrakeTorque: 300 }));
    expect(spec.drive).toMatchObject({ maxSlipSpeed: 6, maxPower: 20_000, maxTorque: 120 });
    expect(spec.rearBrakeTorque).toBe(300);
  });
});
