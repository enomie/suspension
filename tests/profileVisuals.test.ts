import { describe, expect, it } from 'vitest';
import { createDifferentialMarkers } from '../src/render/vehicle/differentialVisual';
import { createPreviewBox } from '../src/render/vehicle/previewBoxVisual';
import { buildCustomSpec, DEFAULT_CUSTOM } from '../src/shared/customVehicle';
import { frameHalfLength, frameTopY } from '../src/shared/vehicleSpec';

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
  it('none when no axle has a differential', () => {
    expect(createDifferentialMarkers(withDiff(false, false)).count).toBe(0);
    expect(createDifferentialMarkers(withDiff(true, true)).count).toBe(2);
  });
});

describe('preview box', () => {
  it('is the lower collider of the spec: on the frame, same width, 0.5 m longer, semi-transparent', () => {
    const spec = buildCustomSpec(DEFAULT_CUSTOM);
    const box = createPreviewBox(spec)!;
    expect(box.name).toBe('collider-lower');
    expect(box.position.y - box.scale.y / 2).toBeCloseTo(frameTopY(spec));
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
