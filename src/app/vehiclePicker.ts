import { VEHICLE_PRESET_LABELS } from '../shared/vehiclePresetLabels';

/** Dropdown oben rechts: Fahrzeug-Preset wählen. */
export class VehiclePicker {
  readonly select: HTMLSelectElement;
  private syncing = false;

  constructor(parent: HTMLElement, onSelect: (preset: number) => void) {
    const wrap = document.createElement('div');
    wrap.id = 'vehicle-picker';
    const label = document.createElement('label');
    label.htmlFor = 'vehicle-preset';
    label.textContent = 'Fahrzeug';
    this.select = document.createElement('select');
    this.select.id = 'vehicle-preset';
    for (const [i, label] of VEHICLE_PRESET_LABELS.entries()) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = label;
      this.select.appendChild(opt);
    }
    this.select.addEventListener('change', () => {
      if (this.syncing) return;
      onSelect(Number(this.select.value));
    });
    wrap.append(label, this.select);
    parent.appendChild(wrap);
  }

  setPreset(preset: number): void {
    const v = String(preset);
    if (this.select.value === v) return;
    this.syncing = true;
    this.select.value = v;
    this.syncing = false;
  }
}