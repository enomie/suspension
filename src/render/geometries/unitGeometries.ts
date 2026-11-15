import { BoxGeometry, CylinderGeometry } from 'three';

/**
 * Unit-Primitives, 1:1 wie in apokalypto (`game-geometries/unit-*-geometry.ts`): Kantenlänge / Durchmesser / Höhe = 1.
 * Größe immer über die Instanz-Matrix (scale) – so passt der Code später direkt ins Apokalypto-Instancing.
 */
export const UNIT_BOX_GEOMETRY = new BoxGeometry(1, 1, 1);
export const UNIT_CYLINDER_GEOMETRY = new CylinderGeometry(0.5, 0.5, 1, 32);
