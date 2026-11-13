import {
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Float32BufferAttribute,
} from 'three';
import { TERRAIN_SIZE_M, TERRAIN_ROWS, TERRAIN_COLS } from './terrainConfig';
import { generatePlaneVertexHeights } from './generateHeights';

export function createTerrainMesh(): Mesh {
  const geometry = new PlaneGeometry(
    TERRAIN_SIZE_M,
    TERRAIN_SIZE_M,
    TERRAIN_ROWS,
    TERRAIN_COLS,
  );
  geometry.rotateX(-Math.PI / 2);

  const heights = generatePlaneVertexHeights();
  const position = geometry.attributes.position;
  for (let i = 0; i < heights.length; i++) {
    position.setY(i, heights[i]);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({
    color: new Color(0x4a6741),
    roughness: 0.92,
    metalness: 0.02,
    flatShading: false,
  });

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.position.set(0, 0, 0);

  geometry.setAttribute('terrainHeight', new Float32BufferAttribute(heights, 1));

  return mesh;
}
