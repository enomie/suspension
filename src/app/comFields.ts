import { COM_OFFSET_LIMITS } from '../shared/customRules';
import type { Vec3 } from '../shared/vehicleSpec';
import { numberInput } from './numberField';

/**
 * The three center of mass offset fields (x, y, z), shared by the wheeled and the tracked panel.
 * `get` returns the offset array of the current config; edits write into it in place.
 */
export function comFields(get: () => Vec3): { fields: HTMLLabelElement[]; sync: () => void } {
  const labels = ['Center of mass x (m)', 'Center of mass y (m)', 'Center of mass z (m, − = front)'];
  const inputs = (['x', 'y', 'z'] as const).map((axis, k) => numberInput(get()[k], COM_OFFSET_LIMITS[axis], 0.05, (v) => (get()[k] = v)));
  const fields = inputs.map((input, k) => {
    const label = document.createElement('label');
    label.append(labels[k], input);
    return label;
  });
  return { fields, sync: () => inputs.forEach((input, k) => input.setNumber(get()[k])) };
}
