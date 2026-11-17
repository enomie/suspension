import {
  CUSTOM_LIMITS,
  DEFAULT_CUSTOM,
  SUSPENSION_LABELS,
  WHEEL_LAYOUT_LABELS,
  buildCustomSpec,
  suspensionsFor,
  type CustomAxleConfig,
  type CustomVehicleConfig,
  type SteerMode,
  type WheelLayout,
} from '../shared/customVehicle';
import { topSpeed } from '../shared/performance';
import type { VehicleSpec } from '../shared/vehicleSpec';

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
 * wheels (pair, center, center double), steering mode, suspension type (the list depends on wheels and steering), drive, track width and wheel size.
 * "Apply" builds a `VehicleSpec` and hands it to `onApply`.
 */
export class CustomPanel {
  private config: CustomVehicleConfig = structuredClone(DEFAULT_CUSTOM);
  private axleHost = el('div', { className: 'custom-axles' });
  private topSpeedOut = el('output');

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

    const apply = el('button', { type: 'button', textContent: 'Apply' });
    apply.addEventListener('click', () => onApply(buildCustomSpec(this.config)));

    details.append(
      field('Wheelbase (m)', wheelbase),
      field('Axles', count),
      this.axleHost,
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
    drive.addEventListener('change', () => ((c.drive = drive.checked), this.refreshTopSpeed()));

    return el(
      'fieldset',
      {},
      el('legend', { textContent: `Axle ${i + 1}${tag}` }),
      field('Wheels', wheels),
      field('Steering', steer),
      field('Suspension', susp),
      field('Track (m)', trackInput),
      field('Radius (m)', numberInput(c.wheelRadius, CUSTOM_LIMITS.wheelRadius, 0.01, (v) => ((c.wheelRadius = v), this.refreshTopSpeed()))),
      field('Driven', drive),
    );
  }
}
