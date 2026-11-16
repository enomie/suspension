import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** orbit camera following a target: camera shifts with target motion, orbit stays free. */
export class CameraRig {
  private last = new Vector3();
  private initialized = false;

  constructor(
    readonly camera: PerspectiveCamera,
    readonly controls: OrbitControls,
    private offset = new Vector3(6, 4, 9),
  ) {}

  follow(target: Vector3): void {
    if (!this.initialized) {
      this.camera.position.copy(target).add(this.offset);
      this.initialized = true;
    } else {
      this.camera.position.x += target.x - this.last.x;
      this.camera.position.y += target.y - this.last.y;
      this.camera.position.z += target.z - this.last.z;
    }
    this.controls.target.copy(target);
    this.last.copy(target);
    this.controls.update();
  }

  shift(dx: number, dz: number): void {
    for (const v of [this.camera.position, this.controls.target, this.last]) {
      v.x -= dx;
      v.z -= dz;
    }
  }
}
