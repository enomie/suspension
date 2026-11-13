import { MeshStandardMaterial } from 'three';

/** Einfarbig, keine Texturen. */
export const MAT = {
  frame: new MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.4 }),
  spring: new MeshStandardMaterial({ color: 0xf2c230, roughness: 0.4 }),
  damper: new MeshStandardMaterial({ color: 0x15171a, roughness: 0.5 }),
  rod: new MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.2, metalness: 0.8 }),
  knuckle: new MeshStandardMaterial({ color: 0xd8543c, roughness: 0.5 }),
  hub: new MeshStandardMaterial({ color: 0x8a9099, roughness: 0.4, metalness: 0.5 }),
};
