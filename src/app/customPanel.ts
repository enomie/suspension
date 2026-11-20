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
  type WheelLayout,
} from '../shared/customVehicle';
import { topSpeed } from '../shared/performance';
import type { VehicleSpec, WheelShape } from '../shared/vehicleSpec';

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

function numberInput(value: number, [min, max]: readonly [number, number], step: number, onChange: (v: number) => void): HTMLInputElement {
  const i = el('input', { type: 'number', value: String(value), min: String(min), max: String(max), step: String(step) });
  i.addEventListener('change', () => {
    const v = Math.min(max, Math.max(min, Number(i.value) || min));
    i.value = String(v);
    onChange(v);
  });
  return i;
}

/**
 * Collapsible panel to assemble any vehicle: wheelbase (front to rear axle), number of axles (1–5), and per axle
 * wheels (pair, center, center double), steering mode, suspension type (the list depends on wheels and steering), drive, differential (driven axles only),
 * handbrake, track width and wheel size. Vehicle-wide: weight, center of mass offset, handbrake torque, engine torque and power.
 * "Apply" builds a `VehicleSpec` and hands it to `onApply`.
 */
export class CustomPanel {
  private config: CustomVehicleConfig = structuredClone(DEFAULT_CUSTOM);
  private axleHost = el('div', { className: 'custom-axles' });
  private topSpeedOut = el('output');
  /** writes the current config into the top-level inputs (set in the constructor) */
  private syncInputs: () => void = () => {};

  constructor(parent: HTMLElement, onApply: (spec: VehicleSpec) => void) {
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
    const com = (['x', 'y', 'z'] as const).map((axis, k) =>
      numberInput(this.config.comOffset[k], CUSTOM_LIMITS.comOffset[axis], 0.05, (v) => (this.config.comOffset[k] = v)),
    );

    this.syncInputs = () => {
      weight.value = String(this.config.weight);
      handbrake.value = String(this.config.handbrakeTorque);
      com.forEach((input, k) => (input.value = String(this.config.comOffset[k])));
      wheelbase.value = String(this.config.wheelbase);
      count.value = String(this.config.axles.length);
      torque.value = String(this.config.torque);
      power.value = String(this.config.power);
      wheelspin.value = String(this.config.wheelspin);
    };

    const apply = el('button', { type: 'button', textContent: 'Apply' });
    apply.addEventListener('click', () => onApply(buildCustomSpec(this.config)));

    details.append(
      field('Wheelbase (m)', wheelbase),
      field('Axles', count),
      this.axleHost,
      field('Weight (kg)', weight),
      field('Center of mass x (m)', com[0]),
      field('Center of mass y (m)', com[1]),
      field('Center of mass z (m, − = front)', com[2]),
      field('Handbrake torque per wheel (N·m)', handbrake),
      field('Torque (N·m)', torque),
      field('Power (kW)', power),
      field('Wheelspin (m/s)', wheelspin),
      field('Top speed', this.topSpeedOut),
      apply,
    );
    parent.append(details);
    this.renderAxles();
    this.refreshTopSpeed();
  }

  /** Replace the whole panel with this config (e.g. when a preset is picked in the vehicle dropdown) */
  load(config: CustomVehicleConfig): void {
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

    const wheels = el('select');
    for (const w of Object.keys(WHEEL_LAYOUT_LABELS) as WheelLayout[]) wheels.append(option(w, WHEEL_LAYOUT_LABELS[w]));
    wheels.value = c.wheels;

    const shape = el('select');
    for (const w of Object.keys(WHEEL_SHAPE_LABELS) as WheelShape[]) shape.append(option(w, WHEEL_SHAPE_LABELS[w]));
    shape.value = c.wheelShape;
    const widthInput = numberInput(c.wheelWidth, CUSTOM_LIMITS.wheelWidth, 0.01, (v) => (c.wheelWidth = v));
    widthInput.disabled = c.wheelShape === 'torus';
    shape.addEventListener('change', () => {
      c.wheelShape = shape.value as WheelShape;
      widthInput.disabled = c.wheelShape === 'torus';
    });

    const steer = el('select');
    for (const m of Object.keys(STEER_LABELS) as SteerMode[]) steer.append(option(m, STEER_LABELS[m]));
    steer.value = c.steer;

    const susp = el('select');
    const fillSuspension = () => {
      const allowed = suspensionsFor(c.steer, c.wheels);
      if (!allowed.includes(c.suspension)) c.suspension = allowed[0];
      susp.replaceChildren(...allowed.map((t) => option(t, SUSPENSION_LABELS[t])));
      susp.value = c.suspension;
    };
    fillSuspension();
    steer.addEventListener('change', () => {
      c.steer = steer.value as SteerMode;
      fillSuspension();
    });
    const trackInput = numberInput(c.track, CUSTOM_LIMITS.track, 0.05, (v) => (c.track = v));
    trackInput.disabled = c.wheels !== 'pair';
    wheels.addEventListener('change', () => {
      c.wheels = wheels.value as WheelLayout;
      trackInput.disabled = c.wheels !== 'pair';
      fillSuspension();
      this.refreshTopSpeed();
    });
    susp.addEventListener('change', () => (c.suspension = susp.value as CustomAxleConfig['suspension']));

    const drive = el('input', { type: 'checkbox', checked: c.drive });
    const differential = el('input', { type: 'checkbox', checked: c.differential, disabled: !c.drive });
    differential.addEventListener('change', () => (c.differential = differential.checked));
    drive.addEventListener('change', () => {
      c.drive = drive.checked;
      differential.disabled = !c.drive;
      this.refreshTopSpeed();
    });
    const handbrake = el('input', { type: 'checkbox', checked: c.handbrake });
    handbrake.addEventListener('change', () => (c.handbrake = handbrake.checked));

    return el(
      'fieldset',
      {},
      el('legend', { textContent: `Axle ${i + 1}${tag}` }),
      field('Wheels', wheels),
      field('Steering', steer),
      field('Suspension', susp),
      field('Track (m)', trackInput),
      field('Radius (m)', numberInput(c.wheelRadius, CUSTOM_LIMITS.wheelRadius, 0.01, (v) => ((c.wheelRadius = v), this.refreshTopSpeed()))),
      field('Wheel shape', shape),
      field('Width (m)', widthInput),
      field('Driven', drive),
      field('Differential', differential),
      field('Handbrake', handbrake),
    );
  }
}
