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

/** Debug: Geomorphing an (1) / aus (0) */
export const morphEnabled = uniform(1);

/**
 * Ein Material für alle Kacheln. CDLOD-Geomorphing im Vertex-Shader: zwischen morphRange.x und .y
 * (Abstand Vertex–Kamera) gleiten Höhe UND Normale zur nächstgröberen Stufe → weder Geometrie- noch
 * Licht-Sprung beim Kachelwechsel.
 */
export function terrainMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: 0x4a6741, roughness: 0.92, metalness: 0.02 });
  // grass → road colour by per-vertex road coverage
  m.colorNode = mix(vec3(0.29, 0.4, 0.25), vec3(0.34, 0.32, 0.29), varying(attribute('road', 'float')));
  const range = attribute('morphRange', 'vec2');
  // positionLocal enthält hier bereits die Kachel-Position (BatchedMesh)
  const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const k = varying(smoothstep(range.x, range.y, distance(wp, cameraPosition)).mul(morphEnabled));
  m.positionNode = positionLocal.add(vec3(0, attribute('morph', 'float').mul(k), 0));
  m.normalNode = transformNormalToView(mix(normalLocal, attribute('morphNormal', 'vec3'), k)).normalize();
  return m;
}
