import type { AxleSpec, Corner } from '../../types';
import type { BuildContext } from '../context';

export type BuiltCorner = Corner;
/** one suspension builder builds a complete axle (both sides). */
export type AxleBuilder = (ctx: BuildContext, axle: AxleSpec, axleIndex: number) => BuiltCorner[];

export const sidesOf = (axle: AxleSpec) => (axle.track > 0 ? (['L', 'R'] as const) : (['C'] as const));
