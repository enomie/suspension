import { BoxGeometry, CylinderGeometry, RingGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Unit-Primitives, 1:1 wie in apokalypto (`game-geometries/unit-*-geometry.ts`): Kantenlänge / Durchmesser / Höhe = 1.
 * Größe immer über die Instanz-Matrix (scale) – so passt der Code später direkt ins Apokalypto-Instancing.
 */
export const UNIT_BOX_GEOMETRY = new BoxGeometry(1, 1, 1);
export const UNIT_CYLINDER_GEOMETRY = new CylinderGeometry(0.5, 0.5, 1, 32);

/** Hohlzylinder wie in apokalypto: Außenradius 0,5, Innenradius 0,3 (Verhältnis 0,6), Höhe 1, innen nach innen gewendet */
export const UNIT_HOLLOW_INNER_RATIO = 0.6;
export const UNIT_HOLLOW_CYLINDER_GEOMETRY = (() => {
  const rOut = 0.5;
  const rIn = rOut * UNIT_HOLLOW_INNER_RATIO;
  const outer = new CylinderGeometry(rOut, rOut, 1, 32, 1, true);
  const inner = new CylinderGeometry(rIn, rIn, 1, 32, 1, true);
  const idx = inner.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const t1 = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, t1);
  }
  inner.computeVertexNormals();
  const bottom = new RingGeometry(rIn, rOut, 32, 1).rotateX(Math.PI / 2).translate(0, -0.5, 0);
  const top = new RingGeometry(rIn, rOut, 32, 1).rotateX(-Math.PI / 2).translate(0, 0.5, 0);
  return mergeGeometries([outer, inner, bottom, top], false);
})();
