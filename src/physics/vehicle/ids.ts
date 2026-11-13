import type { Side } from './types';

/** Namensschema: `<vehicle>.a<axle><side>.<part>` – z. B. `car.a0L.wheel`, `car.a0L.j.steer`. */
export function cornerId(vehicle: string, axle: number, side: Side): string {
  return `${vehicle}.a${axle}${side}`;
}
export function partId(corner: string, part: string): string {
  return `${corner}.${part}`;
}
