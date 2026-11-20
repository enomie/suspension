import { CUSTOM_TRACKED_LIMITS, DEFAULT_CUSTOM_TRACKED, type CustomTrackEndConfig, type CustomTrackedConfig } from '../shared/customTracked';
import { numberInput, type NumberInput } from './numberField';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

const field = (label: string, input: HTMLElement) => el('label', {}, label, input);

/**
 * Fields of a custom tracked vehicle: road axles (count, spacing, wheel radius), track and chain, idler and sprocket
 * (distance from the outer road axle, height, size), weight, drive and turning. Edits `config` in place.
 */
export class CustomTrackedSection {
  readonly element = el('div', { className: 'custom-tracked' });
  config: CustomTrackedConfig = structuredClone(DEFAULT_CUSTOM_TRACKED);
  private inputs: { set: () => void }[] = [];

  constructor() {
    const L = CUSTOM_TRACKED_LIMITS;
    const num = (get: () => number, set: (v: number) => void, range: readonly [number, number], step: number): NumberInput => {
      const input = numberInput(get(), range, step, set);
      this.inputs.push({ set: () => input.setNumber(get()) });
      return input;
    };

    const count = el('select');
    for (let n = L.roadAxles[0]; n <= L.roadAxles[1]; n++) count.append(el('option', { value: String(n), textContent: String(n) }));
    count.value = String(this.config.roadAxles);
    count.addEventListener('change', () => (this.config.roadAxles = Number(count.value)));
    this.inputs.push({ set: () => (count.value = String(this.config.roadAxles)) });

    const c = () => this.config;
    this.element.append(
      el('fieldset', {}, el('legend', { textContent: 'Road wheels' }),
        field('Road axles', count),
        field('Axle spacing (m)', num(() => c().axleSpacing, (v) => (c().axleSpacing = v), L.axleSpacing, 0.05)),
        field('Wheel radius (m)', num(() => c().wheelRadius, (v) => (c().wheelRadius = v), L.wheelRadius, 0.01)),
      ),
      el('fieldset', {}, el('legend', { textContent: 'Track' }),
        field('Track (m)', num(() => c().track, (v) => (c().track = v), L.track, 0.05)),
        field('Belt width (m)', num(() => c().beltWidth, (v) => (c().beltWidth = v), L.beltWidth, 0.01)),
        field('Chain thickness (m)', num(() => c().chainThickness, (v) => (c().chainThickness = v), L.chainThickness, 0.005)),
      ),
      this.endFieldset('Idler (front)', () => c().idler),
      this.endFieldset('Sprocket (rear)', () => c().sprocket),
      field('Weight (kg)', num(() => c().weight, (v) => (c().weight = v), L.weight, 100)),
      field('Torque (N·m)', num(() => c().torque, (v) => (c().torque = v), L.torque, 500)),
      field('Power (kW)', num(() => c().power, (v) => (c().power = v), L.power, 10)),
      field('Top speed (m/s)', num(() => c().maxSpeed, (v) => (c().maxSpeed = v), L.maxSpeed, 1)),
      field('Turn speed (m/s)', num(() => c().turnSpeed, (v) => (c().turnSpeed = v), L.turnSpeed, 0.1)),
    );
  }

  private endFieldset(title: string, get: () => CustomTrackEndConfig): HTMLFieldSetElement {
    const L = CUSTOM_TRACKED_LIMITS;
    const num = (key: keyof CustomTrackEndConfig, range: readonly [number, number], step: number) => {
      const input = numberInput(get()[key], range, step, (v) => (get()[key] = v));
      this.inputs.push({ set: () => input.setNumber(get()[key]) });
      return input;
    };
    return el('fieldset', {}, el('legend', { textContent: title }),
      field('Distance from outer axle (m)', num('distance', L.endDistance, 0.05)),
      field('Height above road wheels (m)', num('raise', L.endRaise, 0.05)),
      field('Radius (m)', num('radius', L.endRadius, 0.01)),
      field('Width (m)', num('width', L.endWidth, 0.01)),
    );
  }

  /** Replace all values (e.g. when the tracked preset is picked in the vehicle dropdown) */
  load(config: CustomTrackedConfig): void {
    this.config = structuredClone(config);
    for (const i of this.inputs) i.set();
  }
}
