import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, RingGeometry } from 'three';
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

export const HELIX_TURNS = 6;
/** Nennlänge [m], für die der Draht beim Strecken per scale rund aussieht */
const HELIX_NOMINAL_LENGTH = 0.35;
const HELIX_NOMINAL_DIAMETER = 0.13;
const HELIX_WIRE_RADIUS = 0.007;

/**
 * Unit-Wendel (Feder): Außendurchmesser 1, Länge 1 entlang Y (zentriert, Y −0,5…+0,5 wie der Unit-Zylinder), `HELIX_TURNS` Windungen.
 * Über scale (d, l, d) pro Instanz auf Durchmesser und Länge bringen – die Steigung folgt der Länge.
 * Der Drahtquerschnitt ist vorab für Nenn-Maße gegengerechnet, damit er unter der Nicht-Uniform-Skalierung
 * rund bleibt (bei stark abweichender Länge leicht oval).
 */
export const UNIT_HELIX_GEOMETRY = (() => {
  const steps = HELIX_TURNS * 40;
  const around = 8;
  const rx = HELIX_WIRE_RADIUS / HELIX_NOMINAL_DIAMETER; // Drahtradius in Unit-X/Z
  const ry = HELIX_WIRE_RADIUS / HELIX_NOMINAL_LENGTH; // … in Unit-Y
  const R = 0.5 - rx;
  const pos: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = t * HELIX_TURNS * Math.PI * 2;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    // Drahtmitte läuft von y = −0,5 + ry bis 0,5 − ry, damit die Enden nicht über die Federteller hinausragen
    const y = -0.5 + ry + t * (1 - 2 * ry);
    for (let j = 0; j < around; j++) {
      const phi = (j / around) * Math.PI * 2;
      const radial = R + Math.cos(phi) * rx;
      pos.push(c * radial, y + Math.sin(phi) * ry, sn * radial);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      index.push(a, b, a + around, b, b + around, a + around);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
})();
