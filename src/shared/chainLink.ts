import type { Vec3 } from './vehicleSpec';

/**
 * The chain link (pure data): a few boxes, authored once in a standard size and stretched across the track width per
 * vehicle. Link-local axes: X across the track, Y outward (away from the wheels), Z along the chain.
 * The origin lies on the centre line of the chain, in the middle of the link.
 */
export interface ChainLinkPart {
  /** box centre [m], link-local */
  position: Vec3;
  /** full edge lengths [m] */
  size: Vec3;
}

export interface ChainLinkAsset {
  /** extent across the track (X) the link was authored for [m]; the link is scaled to the belt width from this */
  width: number;
  /** distance between link centres along the chain [m] (nominal: it is adjusted so a whole number of links fits the loop) */
  pitch: number;
  parts: ChainLinkPart[];
}

/**
 * The chain link every tracked vehicle uses. From the outside in: a grouser (cross cleat) on a plate with a raised lip
 * along both edges, and on the inner side two hinge lugs and the pin that joins it to the next link. The inner side
 * stays within 0.025 m of the centre line (the chain thickness is 0.05 m), the grouser reaches 0.03 m outward.
 */
export const CHAIN_LINK: ChainLinkAsset = {
  width: 0.4,
  pitch: 0.15,
  parts: [
    { position: [0, 0.01, 0], size: [0.4, 0.02, 0.136] }, // plate
    { position: [0, 0.025, 0], size: [0.4, 0.01, 0.04] }, // grouser
    { position: [-0.19, 0.025, 0], size: [0.02, 0.03, 0.136] }, // edge lip
    { position: [0.19, 0.025, 0], size: [0.02, 0.03, 0.136] }, // edge lip
    { position: [-0.12, -0.0125, 0], size: [0.03, 0.025, 0.08] }, // hinge lug
    { position: [0.12, -0.0125, 0], size: [0.03, 0.025, 0.08] }, // hinge lug
    { position: [0, -0.015, 0.068], size: [0.3, 0.02, 0.02] }, // pin
  ],
};
