import { describe, expect, it } from 'vitest';
import { createDifferentialMarkers } from '../src/render/vehicle/differentialVisual';
import { createPreviewBox } from '../src/render/vehicle/previewBoxVisual';
import { buildCustomSpec, DEFAULT_CUSTOM } from '../src/shared/customVehicle';
import { frameHalfLength, frameTopY, hasDifferential } from '../src/shared/vehicleSpec';
import { BIKE_PRESETS } from '../src/physics/vehicle/presets/bike';
import { bikeVehicleSpec } from '../src/shared/bikeSpec';

const withDiff = (front: boolean, rear: boolean) =>
  buildCustomSpec({
    ...DEFAULT_CUSTOM,
    axles: [
      { ...DEFAULT_CUSTOM.axles[0], drive: true, differential: front },
      { ...DEFAULT_CUSTOM.axles[1], drive: true, differential: rear },
    ],
  });

describe('differential markers', () => {
  it('one sphere per driven axle with a differential, at the axle centre', () => {
    const spec = withDiff(false, true);
    const mesh = createDifferentialMarkers(spec);
    expect(mesh.count).toBe(1);
    const p = new (mesh.matrixWorld.constructor as any)().fromArray(mesh.instanceMatrix.array, 0).elements;
    expect(p[12]).toBe(0);
    expect(p[13]).toBeCloseTo(spec.axles[1].y, 5);
    expect(p[14]).toBeCloseTo(spec.axles[1].z, 5);
  });
  it('only a driven left/right pair has one: never a single or twin centered wheel, never a bike', () => {
    expect(hasDifferential({ drive: { share: 1 }, track: 1.6 })).toBe(true);
    expect(hasDifferential({ drive: { share: 1 }, track: 1.6, differential: false })).toBe(false);
    expect(hasDifferential({ track: 1.6 })).toBe(false);
    expect(hasDifferential({ drive: { share: 1 }, track: 0 })).toBe(false);
    for (const b of BIKE_PRESETS) expect(createDifferentialMarkers(bikeVehicleSpec(b)).count).toBe(0);
    for (const wheels of ['center', 'centerDouble'] as const) {
      const spec = buildCustomSpec({
        ...DEFAULT_CUSTOM,
        axles: [DEFAULT_CUSTOM.axles[0], { ...DEFAULT_CUSTOM.axles[1], wheels, suspension: 'strut', drive: true, differential: true }],
      });
      expect(spec.axles[1].differential).toBeUndefined();
      expect(createDifferentialMarkers(spec).count).toBe(0);
    }
  });
  it('none when no axle has a differential', () => {
    expect(createDifferentialMarkers(withDiff(false, false)).count).toBe(0);
    expect(createDifferentialMarkers(withDiff(true, true)).count).toBe(2);
  });
});

describe('preview box', () => {
  it('is the lower collider of the spec: 1 cm above the frame (no z-fighting), centre unchanged, same width, 0.5 m longer, semi-transparent', () => {
    const spec = buildCustomSpec(DEFAULT_CUSTOM);
    const box = createPreviewBox(spec)!;
    expect(box.name).toBe('collider-lower');
    expect(box.position.y - box.scale.y / 2).toBeCloseTo(frameTopY(spec) + 0.01);
    expect(box.position.y).toBeCloseTo(frameTopY(spec) + 0.35 / 2);
    expect(box.scale.x).toBeCloseTo(0.5);
    expect(box.scale.z).toBeCloseTo(frameHalfLength(spec) * 2 + 0.5);
    const m = box.material as { transparent: boolean; opacity: number };
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBeLessThan(1);
  });
  it('is absent when the profile has no collider box', () => {
    expect(createPreviewBox(buildCustomSpec({ ...DEFAULT_CUSTOM, colliderBox: false }))).toBeNull();
  });
});

describe('centre of mass marker', () => {
  it('sits at the profile COM offset and can be hidden', async () => {
    const { createComMarker } = await import('../src/render/vehicle/comVisual');
    const spec = buildCustomSpec({ ...DEFAULT_CUSTOM, comOffset: [0.1, -0.3, 0.4] });
    const m = createComMarker(spec);
    expect(m.position.toArray()).toEqual([0.1, -0.3, 0.4]);
    m.visible = false;
    expect(m.visible).toBe(false);
  });
});
