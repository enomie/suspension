import { CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { ORIGIN } from '../shared/origin';
import type { LogSpec } from '../shared/testLogs';

const bark = new MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.95 });

/** Meshes for the test logs; positions are absolute, the group follows the floating origin. */
export class TestLogsVisual {
  readonly root = new Group();

  constructor(private logs: readonly LogSpec[]) {
    for (const l of logs) {
      const m = new Mesh(new CylinderGeometry(l.radius, l.radius, l.length, 24), bark);
      m.rotation.z = Math.PI / 2;
      m.castShadow = m.receiveShadow = true;
      m.userData.log = l;
      this.root.add(m);
    }
    this.place();
  }

  /** call after the main-thread origin changed */
  place(): void {
    this.root.children.forEach((m, i) => {
      const l = this.logs[i];
      m.position.set(l.x - ORIGIN.x, l.y, l.z - ORIGIN.z);
    });
  }
}
