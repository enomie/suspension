import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';

/** flat color, no textures. */
export const MAT = {
  frame: new MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.4 }),
  spring: new MeshStandardMaterial({ color: 0xf2c230, roughness: 0.4 }),
  damper: new MeshStandardMaterial({ color: 0xd40000, roughness: 0.35, metalness: 0.2 }) /* Ferrari red */,
  rod: new MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.2, metalness: 0.8 }),
  knuckle: new MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.3 }),
  mount: new MeshStandardMaterial({ color: 0x6b727c, roughness: 0.5, metalness: 0.4 }),
  jointBall: new MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.4 }),
  jointHinge: new MeshStandardMaterial({ color: 0x2f7fff, roughness: 0.4 }),
  differential: new MeshStandardMaterial({ color: 0xe03fd8, roughness: 0.4 }),
  previewBox: new MeshStandardMaterial({ color: 0x4fb3ff, roughness: 0.6, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide }),
  com: new MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
  chain: new MeshStandardMaterial({ color: 0x4a4f45, roughness: 0.55, metalness: 0.5 }),
  hub: new MeshStandardMaterial({ color: 0x8a9099, roughness: 0.4, metalness: 0.5 }),
};
