import {
  CUSTOM_LIMITS,
  DEFAULT_CUSTOM,
  SUSPENSION_LABELS,
  WHEEL_LAYOUT_LABELS,
  WHEEL_SHAPE_LABELS,
  buildCustomSpec,
  suspensionsFor,
  type CustomAxleConfig,
  type CustomVehicleConfig,
  type SteerMode,
} from '../shared/customVehicle';
import { numberInput } from './numberField';
import { comFields } from './comFields';
import { topSpeed } from '../shared/performance';
import { buildTrackedSpec, type CustomTrackedConfig } from '../shared/customTracked';
import type { TrackedVehicleSpec } from '../shared/trackedSpec';
import type { SuspensionType, VehicleSpec } from '../shared/vehicleSpec';
import { CustomTrackedSection } from './customTrackedPanel';

const STEER_LABELS: Record<SteerMode, string> = { none: 'No steering', steer: 'Steering', counter: 'Counter-steering' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function option(value: string, text: string): HTMLOptionElement {
  return el('option', { value, textContent: text });
}

function field(label: string, input: HTMLElement): HTMLLabelElement {
  return el('label', {}, label, input);
}

/** dropdown over the keys of a label table */
function labelSelect<T extends string>(labels: Record<T, string>, value: T, onChange: (v: T) => void): HTMLSelectElement {
  const select = el('select');
  for (const key of Object.keys(labels) as T[]) select.append(option(key, labels[key]));
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  return select;
}

function checkbox(checked: boolean, onChange: (on: boolean) => void): HTMLInputElement {
  const box = el('input', { type: 'checkbox', checked });
  box.addEventListener('change', () => onChange(box.checked));
  return box;
}

/**
 * Collapsible panel to assemble any vehicle: wheelbase (front to rear axle), number of axles (1–5), and per axle
 * wheels (pair, center, center double), steering mode, suspension type (the list depends on wheels and steering), drive, differential (driven axles only),
 * handbrake, track width and wheel size. Vehicle-wide: weight, center of mass offset, handbrake torque, engine torque and power.
 * The vehicle type selects between these wheeled fields and the tracked fields (`CustomTrackedSection`).
 * "Apply" builds a `VehicleSpec` or `TrackedVehicleSpec` and hands it to `onApply`.
 */
export class CustomPanel {
  private config: CustomVehicleConfig = structuredClone(DEFAULT_CUSTOM);
  private axleHost = el('div', { className: 'custom-axles' });
  private topSpeedOut = el('output');
  /** writes the current config into the top-level inputs (set in the constructor) */
  private syncInputs: () => void = () => {};

  private wheeledHost = el('div', { className: 'custom-wheeled' });
  private tracked = new CustomTrackedSection();
  private typeSelect = el('select');

  constructor(parent: HTMLElement, onApply: (spec: VehicleSpec | TrackedVehicleSpec) => void) {
    const details = el('details', { id: 'custom-panel' }, el('summary', { textContent: 'Custom vehicle' }));

    const wheelbase = numberInput(this.config.wheelbase, CUSTOM_LIMITS.wheelbase, 0.1, (v) => (this.config.wheelbase = v));
    const count = el('select');
    for (let n = CUSTOM_LIMITS.axles[0]; n <= CUSTOM_LIMITS.axles[1]; n++) count.append(option(String(n), String(n)));
    count.value = String(this.config.axles.length);
    count.addEventListener('change', () => {
      this.setAxleCount(Number(count.value));
      this.renderAxles();
      this.refreshTopSpeed();
    });

    const torque = numberInput(this.config.torque, CUSTOM_LIMITS.torque, 50, (v) => ((this.config.torque = v), this.refreshTopSpeed()));
    const power = numberInput(this.config.power, CUSTOM_LIMITS.power, 5, (v) => ((this.config.power = v), this.refreshTopSpeed()));
    const wheelspin = numberInput(this.config.wheelspin, CUSTOM_LIMITS.wheelspin, 0.5, (v) => (this.config.wheelspin = v));

    const weight = numberInput(this.config.weight, CUSTOM_LIMITS.weight, 10, (v) => ((this.config.weight = v), this.refreshTopSpeed()));
    const handbrake = numberInput(this.config.handbrakeTorque, CUSTOM_LIMITS.handbrakeTorque, 100, (v) => (this.config.handbrakeTorque = v));
    const com = comFields(() => this.config.comOffset);

    const box = el('input', { type: 'checkbox', checked: this.config.colliderBox });
    box.addEventListener('change', () => (this.config.colliderBox = box.checked));

    this.syncInputs = () => {
      box.checked = this.config.colliderBox;
      weight.setNumber(this.config.weight);
      handbrake.setNumber(this.config.handbrakeTorque);
      com.sync();
      wheelbase.setNumber(this.config.wheelbase);
      count.value = String(this.config.axles.length);
      torque.setNumber(this.config.torque);
      power.setNumber(this.config.power);
      wheelspin.setNumber(this.config.wheelspin);
    };

    const apply = el('button', { type: 'button', textContent: 'Apply' });
    apply.addEventListener('click', () => onApply(this.typeSelect.value === 'tracked' ? buildTrackedSpec(this.tracked.config) : buildCustomSpec(this.config)));

    this.typeSelect.append(option('wheeled', 'Wheeled'), option('tracked', 'Tracked'));
    this.typeSelect.addEventListener('change', () => this.showType());

    this.wheeledHost.append(
      field('Wheelbase (m)', wheelbase),
      field('Axles', count),
      this.axleHost,
      field('Collider box (low friction)', box),
      field('Weight (kg)', weight),
      ...com.fields,
      field('Handbrake torque per wheel (N·m)', handbrake),
      field('Torque (N·m)', torque),
      field('Power (kW)', power),
      field('Wheelspin (m/s)', wheelspin),
      field('Top speed', this.topSpeedOut),
    );
    details.append(field('Vehicle type', this.typeSelect), this.wheeledHost, this.tracked.element, apply);
    this.showType();
    parent.append(details);
    this.renderAxles();
    this.refreshTopSpeed();
  }

  /** shows the fields of the selected vehicle type */
  private showType(): void {
    const tracked = this.typeSelect.value === 'tracked';
    this.wheeledHost.hidden = tracked;
    this.tracked.element.hidden = !tracked;
  }

  /** Replace the tracked fields with this config and show them (e.g. when the tracked preset is picked) */
  loadTracked(config: CustomTrackedConfig): void {
    this.tracked.load(config);
    this.typeSelect.value = 'tracked';
    this.showType();
  }

  /** Replace the whole panel with this config (e.g. when a preset is picked in the vehicle dropdown) */
  load(config: CustomVehicleConfig): void {
    this.typeSelect.value = 'wheeled';
    this.showType();
    this.config = structuredClone(config);
    this.syncInputs();
    this.renderAxles();
    this.refreshTopSpeed();
  }

  /** top speed of the current config (where thrust = rolling + air drag) */
  private refreshTopSpeed(): void {
    const v = topSpeed(buildCustomSpec(this.config));
    this.topSpeedOut.textContent = `${v.toFixed(0)} m/s (${(v * 3.6).toFixed(0)} km/h)`;
  }

  /** New axles copy the last one (as a non-steering axle) */
  private setAxleCount(n: number): void {
    const a = this.config.axles;
    while (a.length > n) a.pop();
    while (a.length < n) a.push({ ...a[a.length - 1], steer: 'none' });
  }

  private renderAxles(): void {
    this.axleHost.replaceChildren(...this.config.axles.map((c, i) => this.axleRow(c, i)));
  }

  private axleRow(c: CustomAxleConfig, i: number): HTMLElement {
    const last = this.config.axles.length - 1;
    const tag = i === 0 ? ' (front)' : i === last ? ' (rear)' : '';
    return el('fieldset', {}, el('legend', { textContent: `Axle ${i + 1}${tag}` }), ...this.layoutFields(c), ...this.wheelFields(c), ...this.driveFields(c));
  }

  /** wheel layout, steering, suspension and track: the suspension list depends on layout and steering, the track on the layout */
  private layoutFields(c: CustomAxleConfig): HTMLLabelElement[] {
    const susp = el('select');
    const fillSuspension = () => {
      const allowed = suspensionsFor(c.steer, c.wheels);
      if (!allowed.includes(c.suspension)) c.suspension = allowed[0];
      susp.replaceChildren(...allowed.map((t) => option(t, SUSPENSION_LABELS[t])));
      susp.value = c.suspension;
    };
    susp.addEventListener('change', () => (c.suspension = susp.value as SuspensionType));
    const trackInput = numberInput(c.track, CUSTOM_LIMITS.track, 0.05, (v) => (c.track = v));
    trackInput.disabled = c.wheels !== 'pair';

    const wheels = labelSelect(WHEEL_LAYOUT_LABELS, c.wheels, (v) => {
      c.wheels = v;
      trackInput.disabled = v !== 'pair';
      fillSuspension();
      this.refreshTopSpeed();
    });
    const steer = labelSelect(STEER_LABELS, c.steer, (v) => {
      c.steer = v;
      fillSuspension();
    });
    fillSuspension();
    return [field('Wheels', wheels), field('Steering', steer), field('Suspension', susp), field('Track (m)', trackInput)];
  }

  /** wheel radius, shape and width (a torus gets its width from the radius) */
  private wheelFields(c: CustomAxleConfig): HTMLLabelElement[] {
    const widthInput = numberInput(c.wheelWidth, CUSTOM_LIMITS.wheelWidth, 0.01, (v) => (c.wheelWidth = v));
    widthInput.disabled = c.wheelShape === 'torus';
    const shape = labelSelect(WHEEL_SHAPE_LABELS, c.wheelShape, (v) => {
      c.wheelShape = v;
      widthInput.disabled = v === 'torus';
    });
    const radius = numberInput(c.wheelRadius, CUSTOM_LIMITS.wheelRadius, 0.01, (v) => ((c.wheelRadius = v), this.refreshTopSpeed()));
    return [field('Radius (m)', radius), field('Wheel shape', shape), field('Width (m)', widthInput)];
  }

  /** driven, differential (driven axles only) and handbrake */
  private driveFields(c: CustomAxleConfig): HTMLLabelElement[] {
    const differential = checkbox(c.differential, (on) => (c.differential = on));
    differential.disabled = !c.drive;
    const drive = checkbox(c.drive, (on) => {
      c.drive = on;
      differential.disabled = !on;
      this.refreshTopSpeed();
    });
    const handbrake = checkbox(c.handbrake, (on) => (c.handbrake = on));
    return [field('Driven', drive), field('Differential', differential), field('Handbrake', handbrake)];
  }
}
