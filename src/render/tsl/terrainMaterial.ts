import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  distance,
  mix,
  modelWorldMatrix,
  normalLocal,
  positionLocal,
  smoothstep,
  transformNormalToView,
  uniform,
  varying,
  vec3,
  vec4,
} from 'three/tsl';

/** debug: geomorphing on (1) / off (0) */
export const morphEnabled = uniform(1);

/**
 * one material for all tiles. CDLOD geomorphing in vertex shader: between morphRange.x and .y
 * (vertex–camera distance) blend height AND normal toward next coarser level → no geometry or
 * lighting pop on tile change.
 */
export function terrainMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: 0x4a6741, roughness: 0.92, metalness: 0.02 });
  // grass → road colour by per-vertex road coverage
  m.colorNode = mix(vec3(0.29, 0.4, 0.25), vec3(0.34, 0.32, 0.29), varying(attribute('road', 'float')));
  const range = attribute('morphRange', 'vec2');
  // positionLocal already includes tile position here (BatchedMesh)
  const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const k = varying(smoothstep(range.x, range.y, distance(wp, cameraPosition)).mul(morphEnabled));
  m.positionNode = positionLocal.add(vec3(0, attribute('morph', 'float').mul(k), 0));
  m.normalNode = transformNormalToView(mix(normalLocal, attribute('morphNormal', 'vec3'), k)).normalize();
  return m;
}
