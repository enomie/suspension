import { DirectionalLight, Vector3 } from 'three';
import { ORIGIN } from '../shared/origin';

const SHADOW_EXTENT = 64; // ±m um das Fahrzeug
const SHADOW_MAP = 2048;

/**
 * Sonne mit Schatten, die dem Fahrzeug folgt – im Licht-Raum auf ganze Shadow-Texel gerastert,
 * damit Schattenkanten nicht „schwimmen“. Gerastert wird in ABSOLUTEN Koordinaten, sonst springt
 * das Raster bei jedem Floating-Origin-Shift. Bias gegen Schatten-Akne.
 */
export class SunRig {
  readonly light = new DirectionalLight(0xfff4e0, 1.4);
  /** Debug: Sonne folgt nicht mehr */
  frozen = false;
  private dir: Vector3;
  private right = new Vector3();
  private up = new Vector3();
  private texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
  private abs = new Vector3();
  private snapped = new Vector3();

  constructor(private offset = new Vector3(60, 90, 40)) {
    const l = this.light;
    l.castShadow = true;
    l.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    const c = l.shadow.camera;
    c.near = 1;
    c.far = offset.length() + 120;
    c.left = c.bottom = -SHADOW_EXTENT;
    c.right = c.top = SHADOW_EXTENT;
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.03;
    this.dir = offset.clone().normalize();
    this.right.crossVectors(new Vector3(0, 1, 0), this.dir).normalize();
    this.up.crossVectors(this.dir, this.right).normalize();
  }

  /** target = lokale Position (Render-Koordinaten) */
  follow(target: Vector3): void {
    if (this.frozen) return;
    const a = this.abs.set(target.x + ORIGIN.x, target.y, target.z + ORIGIN.z);
    const r = Math.round(a.dot(this.right) / this.texel) * this.texel;
    const u = Math.round(a.dot(this.up) / this.texel) * this.texel;
    const p = this.snapped
      .set(0, 0, 0)
      .addScaledVector(this.right, r)
      .addScaledVector(this.up, u)
      .addScaledVector(this.dir, a.dot(this.dir));
    p.x -= ORIGIN.x;
    p.z -= ORIGIN.z;
    this.light.target.position.copy(p);
    this.light.position.copy(p).add(this.offset);
    this.light.target.updateMatrixWorld();
    this.light.updateMatrixWorld();
  }
}
