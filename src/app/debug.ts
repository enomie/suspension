import { BasicShadowMap, PCFShadowMap, PCFSoftShadowMap, VSMShadowMap, type ShadowMapType } from 'three';
import type { Stage } from '../render/scene';
import type { LodTerrain } from '../render/terrain/LodTerrain';
import { morphEnabled } from '../render/terrain/LodTerrain';
import type { PhysicsClient } from './PhysicsClient';
import type { Keyboard } from './keyboard';

/**
 * Debug toggles to isolate flicker (F-keys; URL `?debug=shadows,morph,…` can pre-disable):
 *   F1 shadows · F2 terrain morph · F3 vehicle interpolation · F4 freeze LOD selection · F5 wireframe
 *   F6 freeze sun (does not follow car) · F7 cycle shadow filter (PCF → soft → VSM → hard)
 * Also: frame hitches (> 2× average) counted and shown in HUD.
 */
const SHADOW_TYPES: [string, ShadowMapType][] = [
  ['PCF', PCFShadowMap],
  ['PCF soft', PCFSoftShadowMap],
  ['VSM', VSMShadowMap],
  ['hard', BasicShadowMap],
];

export class DebugToggles {
  shadows = true;
  morph = true;
  interpolation = true;
  lodFrozen = false;
  wireframe = false;
  sunFrozen = false;
  shadowType = 0;
  /** frames that took > 2× the running average */
  hitches = 0;
  lastHitchMs = 0;
  private avgMs = 8;

  constructor(
    private stage: Stage,
    private terrain: LodTerrain,
    private physics: PhysicsClient,
    private keyboard: Keyboard,
    off: string[] = [],
  ) {
    if (off.includes('shadows')) this.shadows = false;
    if (off.includes('morph')) this.morph = false;
    if (off.includes('interp')) this.interpolation = false;
    this.apply();
  }

  /** once per frame */
  update(frameMs: number): void {
    const k = this.keyboard;
    let changed = false;
    if (k.consume('F1')) (this.shadows = !this.shadows), (changed = true);
    if (k.consume('F2')) (this.morph = !this.morph), (changed = true);
    if (k.consume('F3')) (this.interpolation = !this.interpolation), (changed = true);
    if (k.consume('F4')) (this.lodFrozen = !this.lodFrozen), (changed = true);
    if (k.consume('F5')) (this.wireframe = !this.wireframe), (changed = true);
    if (k.consume('F6')) (this.sunFrozen = !this.sunFrozen), (changed = true);
    if (k.consume('F7')) (this.shadowType = (this.shadowType + 1) % SHADOW_TYPES.length), (changed = true);
    if (changed) this.apply();

    if (frameMs > this.avgMs * 2 && frameMs > 12) {
      this.hitches++;
      this.lastHitchMs = frameMs;
    }
    this.avgMs = this.avgMs * 0.98 + Math.min(frameMs, 50) * 0.02;
  }

  private apply(): void {
    this.stage.renderer.shadowMap.enabled = this.shadows;
    this.stage.sun.light.castShadow = this.shadows;
    morphEnabled.value = this.morph ? 1 : 0;
    this.physics.raw = !this.interpolation;
    this.terrain.frozen = this.lodFrozen;
    this.terrain.wireframe = this.wireframe;
    this.stage.sun.frozen = this.sunFrozen;
    const type = SHADOW_TYPES[this.shadowType][1];
    if (this.stage.renderer.shadowMap.type !== type) {
      this.stage.renderer.shadowMap.type = type;
      // rebuild shadow shaders
      this.stage.sun.light.shadow.map?.dispose();
      this.stage.sun.light.shadow.map = null;
      this.stage.scene.traverse((o) => {
        const m = (o as { material?: { needsUpdate: boolean } }).material;
        if (m) m.needsUpdate = true;
      });
    }
  }

  /** one HUD line */
  get summary(): string {
    const f = (on: boolean) => (on ? 'on ' : 'OFF');
    return (
      `debug    F1 shadows ${f(this.shadows)} · F2 morph ${f(this.morph)} · F3 interp. ${f(this.interpolation)}` +
      ` · F4 LOD ${this.lodFrozen ? 'LOCK' : 'live'} · F5 grid ${this.wireframe ? 'on' : 'off'}` +
      ` · F6 sun ${this.sunFrozen ? 'LOCK' : 'follow'} · F7 ${SHADOW_TYPES[this.shadowType][0]}` +
      ` · hitches ${this.hitches} (last ${this.lastHitchMs.toFixed(0)} ms)`
    );
  }
}
