import type { Stage } from '../render/scene';
import type { LodTerrain } from '../render/terrain/LodTerrain';
import { morphEnabled } from '../render/terrain/LodTerrain';
import type { PhysicsClient } from './PhysicsClient';
import type { Keyboard } from './keyboard';

/**
 * Debug-Schalter zum Eingrenzen von Flackern (F-Tasten, auch per URL `?debug=shadows,morph,…` vorab AUS):
 *   F1 Schatten · F2 Terrain-Morph · F3 Fahrzeug-Interpolation · F4 LOD-Auswahl einfrieren · F5 Drahtgitter
 * Zusätzlich: Frame-Ausreißer (> 2× Mittel) werden gezählt und im HUD angezeigt.
 */
export class DebugToggles {
  shadows = true;
  morph = true;
  interpolation = true;
  lodFrozen = false;
  wireframe = false;
  /** Frames, die > 2× so lang wie der Mittelwert dauerten */
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

  /** einmal pro Frame */
  update(frameMs: number): void {
    const k = this.keyboard;
    let changed = false;
    if (k.consume('F1')) (this.shadows = !this.shadows), (changed = true);
    if (k.consume('F2')) (this.morph = !this.morph), (changed = true);
    if (k.consume('F3')) (this.interpolation = !this.interpolation), (changed = true);
    if (k.consume('F4')) (this.lodFrozen = !this.lodFrozen), (changed = true);
    if (k.consume('F5')) (this.wireframe = !this.wireframe), (changed = true);
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
  }

  /** eine HUD-Zeile */
  get summary(): string {
    const f = (on: boolean) => (on ? 'an ' : 'AUS');
    return (
      `debug    F1 Schatten ${f(this.shadows)} · F2 Morph ${f(this.morph)} · F3 Interp. ${f(this.interpolation)}` +
      ` · F4 LOD ${this.lodFrozen ? 'FEST' : 'frei'} · F5 Gitter ${this.wireframe ? 'an' : 'aus'}` +
      ` · Ausreißer ${this.hitches} (zuletzt ${this.lastHitchMs.toFixed(0)} ms)`
    );
  }
}
