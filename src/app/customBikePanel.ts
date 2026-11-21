import { CUSTOM_BIKE_LIMITS, DEFAULT_CUSTOM_BIKE, bikeConfigFromSpec, buildBikeSpec, type CustomBikeConfig, type CustomBikeWheelConfig } from '../shared/customBike';
import { bikeVehicleSpec, type BikeVehicleSpec } from '../shared/bikeSpec';
import { topSpeed } from '../shared/performance';
import { numberInput, type NumberInput } from './numberField';
import { comFields } from './comFields';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

const field = (label: string, input: HTMLElement) => el('label', {}, label, input);

/**
 * Fields of a custom bike: wheelbase, radius and width per wheel, then the same chassis and drive fields as the
 * wheeled panel (collider box, weight, center of mass, rear brake, torque, power, wheelspin, top speed).
 * Fork, swingarm and tires are always the same, so there is no axle count and no suspension choice. Edits `config` in place.
 */
export class CustomBikeSection {
  readonly element = el('div', { className: 'custom-bike' });
  config: CustomBikeConfig = structuredClone(DEFAULT_CUSTOM_BIKE);
  private inputs: { set: () => void }[] = [];
  private topSpeedOut = el('output');

  constructor() {
    const L = CUSTOM_BIKE_LIMITS;
    const c = () => this.config;
    const num = (get: () => number, set: (v: number) => void, range: readonly [number, number], step: number): NumberInput => {
      const input = numberInput(get(), range, step, (v) => (set(v), this.refreshTopSpeed()));
      this.inputs.push({ set: () => input.setNumber(get()) });
      return input;
    };
    const wheel = (title: string, get: () => CustomBikeWheelConfig) =>
      el('fieldset', {}, el('legend', { textContent: title }),
        field('Radius (m)', num(() => get().radius, (v) => (get().radius = v), L.wheelRadius, 0.01)),
        field('Width (m)', num(() => get().width, (v) => (get().width = v), L.wheelWidth, 0.01)),
      );

    const box = el('input', { type: 'checkbox', checked: this.config.colliderBox });
    box.addEventListener('change', () => (this.config.colliderBox = box.checked));
    this.inputs.push({ set: () => (box.checked = this.config.colliderBox) });
    const com = comFields(() => c().comOffset);
    this.inputs.push({ set: com.sync });

    this.element.append(
      field('Wheelbase (m)', num(() => c().wheelbase, (v) => (c().wheelbase = v), L.wheelbase, 0.05)),
      wheel('Front wheel', () => c().front),
      wheel('Rear wheel', () => c().rear),
      field('Collider box (low friction)', box),
      field('Weight (kg)', num(() => c().weight, (v) => (c().weight = v), L.weight, 10)),
      ...com.fields,
      field('Rear brake torque (N·m)', num(() => c().rearBrakeTorque, (v) => (c().rearBrakeTorque = v), L.rearBrakeTorque, 50)),
      field('Torque (N·m)', num(() => c().torque, (v) => (c().torque = v), L.torque, 10)),
      field('Power (kW)', num(() => c().power, (v) => (c().power = v), L.power, 1)),
      field('Wheelspin (m/s)', num(() => c().wheelspin, (v) => (c().wheelspin = v), L.wheelspin, 0.5)),
      field('Top speed', this.topSpeedOut),
    );
    this.refreshTopSpeed();
  }

  /** The bike to spawn. The fields then show what was built (corrected values, e.g. a wheelbase grown to fit the wheels) */
  spec(): BikeVehicleSpec {
    const spec = buildBikeSpec(this.config);
    this.load(bikeConfigFromSpec(spec));
    return spec;
  }

  /** Replace all values (e.g. when a bike preset is picked in the vehicle dropdown) */
  load(config: CustomBikeConfig): void {
    this.config = structuredClone(config);
    for (const i of this.inputs) i.set();
    this.refreshTopSpeed();
  }

  private refreshTopSpeed(): void {
    const v = topSpeed(bikeVehicleSpec(buildBikeSpec(this.config)));
    this.topSpeedOut.textContent = `${v.toFixed(0)} m/s (${(v * 3.6).toFixed(0)} km/h)`;
  }
}
