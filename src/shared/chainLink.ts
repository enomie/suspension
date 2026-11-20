import type { Vec3 } from './vehicleSpec';

/**
 * Chain link asset (pure data): a few boxes, authored once in a standardized size and distorted across the track
 * width per vehicle. Link-local axes: X across the track, Y outward (away from the wheels), Z along the chain.
 * The origin lies on the centre line of the chain, in the middle of the link.
 */
export interface ChainLinkPart {
  /** box centre [m], link-local */
  position: Vec3;
  /** full edge lengths [m] */
  size: Vec3;
}

export interface ChainLinkAsset {
  name: string;
  /** extent across the track (X) the link was authored for [m]; the link is scaled to the belt width from this */
  width: number;
  /** distance between link centres along the chain [m] (nominal: it is adjusted so a whole number of links fits the loop) */
  pitch: number;
  parts: ChainLinkPart[];
}

/**
 * Placeholder link until `Drive_Chain_Link.json` of the main game is plugged in: a plate on the outer side,
 * two lugs on the inner side and a pin through the lugs at the front end.
 */
export const PLACEHOLDER_CHAIN_LINK: ChainLinkAsset = {
  name: 'placeholder',
  width: 0.4,
  pitch: 0.15,
  parts: [
    { position: [0, 0.01, 0], size: [0.4, 0.02, 0.14] }, // plate
    { position: [-0.12, -0.02, 0], size: [0.03, 0.04, 0.08] }, // lug
    { position: [0.12, -0.02, 0], size: [0.03, 0.04, 0.08] }, // lug
    { position: [0, -0.025, 0.065], size: [0.3, 0.02, 0.02] }, // pin
  ],
};

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNumber);

/**
 * Checks a chain link asset (e.g. parsed from JSON) and returns it typed.
 * @throws with a message naming the problem
 */
export function parseChainLink(data: unknown): ChainLinkAsset {
  const d = data as Partial<ChainLinkAsset> | null;
  if (!d || typeof d !== 'object') throw new Error('chain link: not an object');
  if (typeof d.name !== 'string' || !d.name) throw new Error('chain link: name is missing');
  if (!isNumber(d.width) || d.width <= 0) throw new Error('chain link: width must be > 0');
  if (!isNumber(d.pitch) || d.pitch <= 0) throw new Error('chain link: pitch must be > 0');
  if (!Array.isArray(d.parts) || d.parts.length === 0) throw new Error('chain link: needs at least one part');
  d.parts.forEach((p, i) => {
    if (!isVec3(p?.position)) throw new Error(`chain link: part ${i} has no valid position`);
    if (!isVec3(p?.size) || p.size.some((s) => s <= 0)) throw new Error(`chain link: part ${i} has no valid size`);
  });
  return d as ChainLinkAsset;
}
