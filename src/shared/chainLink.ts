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
 * The chain link every tracked vehicle uses. Outer side: a plate and a grouser on it, inset 5 % from the plate edges on
 * every side. Inner side: a hinge at each end. The front end (+Z) carries an outer pair of lugs near the plate edges and
 * the pin, the rear end (−Z) an inner pair closer to the centre, so the lugs of neighbouring links interleave on the
 * pin between them. The inner side stays within 0.025 m of the centre line (the chain thickness is 0.05 m), the grouser
 * reaches 0.03 m outward.
 */
const PITCH = 0.15;
const PLATE = { width: 0.4, thickness: 0.02, length: 0.136 };
/** The grouser is inset from the plate edges by this share of the plate size, on every side */
const GROUSER_INSET = 0.05;
const GROUSER_HEIGHT = 0.02;
/** Lugs hang from the plate down to the inner limit, centred on the joint (half a pitch from the link centre) */
const INNER_LIMIT = -0.025;
const LUG = { width: 0.03, length: 0.04, height: -PLATE.thickness / 2 - INNER_LIMIT };
/** lug centres across the track: the outer pair near the plate edges, the inner pair beside it with a gap */
const OUTER_LUG_X = PLATE.width / 2 - LUG.width;
const INNER_LUG_X = OUTER_LUG_X - LUG.width - 0.01;
const LUG_Y = -PLATE.thickness / 2 - LUG.height / 2;
const PIN = { diameter: 0.01, length: 2 * OUTER_LUG_X + LUG.width };

const lug = (x: number, z: number): ChainLinkPart => ({ position: [x, LUG_Y, z], size: [LUG.width, LUG.height, LUG.length] });

export const CHAIN_LINK: ChainLinkAsset = {
  width: PLATE.width,
  pitch: PITCH,
  parts: [
    { position: [0, 0, 0], size: [PLATE.width, PLATE.thickness, PLATE.length] }, // plate
    {
      position: [0, PLATE.thickness / 2 + GROUSER_HEIGHT / 2, 0],
      size: [PLATE.width * (1 - 2 * GROUSER_INSET), GROUSER_HEIGHT, PLATE.length * (1 - 2 * GROUSER_INSET)],
    }, // grouser
    lug(-OUTER_LUG_X, PITCH / 2), // outer lugs, front end
    lug(OUTER_LUG_X, PITCH / 2),
    lug(-INNER_LUG_X, -PITCH / 2), // inner lugs, rear end
    lug(INNER_LUG_X, -PITCH / 2),
    { position: [0, LUG_Y, PITCH / 2], size: [PIN.length, PIN.diameter, PIN.diameter] }, // pin through the front lugs
  ],
};
