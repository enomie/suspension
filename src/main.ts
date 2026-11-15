import './style.css';
import { ORIGIN } from './shared/origin';
import { setTerrain, TERRAIN_PRESETS } from './shared/terrain';
import { OriginShifter } from './shared/originShifter';
import { wallClock } from './shared/snapshot';
import { createStage, gpuBackendLabel } from './render/scene';
import { LodTerrain } from './render/terrain/LodTerrain';
import { VehicleVisual } from './render/vehicle/VehicleVisual';
import { PhysicsClient } from './app/PhysicsClient';
import { Keyboard } from './app/keyboard';
import { TelemetryHud } from './app/hud';
import { DebugToggles } from './app/debug';
import { VehiclePicker } from './app/vehiclePicker';

/*
 * Haupt-Thread. Physik läuft im Worker (src/physics/worker.ts), Terrain-Kacheln in Terrain-Workern.
 * Ablauf pro Frame:
 *   1. Hotkeys / Input → Worker   2. interpolierten Snapshot holen (Zeit = now − delay)
 *   3. Fahrzeug-Meshes setzen   4. Floating-Origin (Haupt-Thread, eigener ORIGIN)
 *   5. Kamera + Sonne folgen   6. LOD-Terrain   7. HUD + Render
 */
const params = new URLSearchParams(location.search);
/** ?x=…&z=… = absolute Startposition [m] */
ORIGIN.x = Number(params.get('x') ?? 0);
ORIGIN.z = Number(params.get('z') ?? 0);
/** ?terrain=<preset>&seed=<zahl> – gilt für alle Threads (wird an die Worker weitergegeben) */
const preset = TERRAIN_PRESETS[params.get('terrain') ?? 'default'] ?? TERRAIN_PRESETS.default;
const world = setTerrain({ ...preset, seed: Number(params.get('seed') ?? preset.seed) });
// ohne ?x/?z: nächster ebener Landpunkt ab 0/0 (Raster 64 m = Origin-Raster → Fahrzeug startet bei lokal 0/0)
if (!params.has('x') && !params.has('z')) {
  const p = world.findLand(0, 0, { step: 64 });
  ORIGIN.x = p.x;
  ORIGIN.z = p.z;
}

async function boot(): Promise<void> {
/** ?dpr=1 senkt die Auflösung (Fill-Rate) */
const stage = await createStage(document.querySelector<HTMLDivElement>('#app')!, {
  dpr: Number(params.get('dpr') ?? 2),
});
const { scene, camera, renderer, cameraRig, sun } = stage;

const terrain = new LodTerrain();
scene.add(terrain.root);

// ── Physik (Worker; ?worker=0 → Haupt-Thread) ────────────────────
let vehicle: VehicleVisual | null = null;
let frameVisible = true;
let jointsVisible = true;
const physics = await PhysicsClient.create({
  preset: 0,
  x: ORIGIN.x,
  z: ORIGIN.z,
  useWorker: params.get('worker') !== '0',
});
const vehiclePickerHost = document.querySelector<HTMLDivElement>('#vehicle-picker-host')!;
const vehiclePicker = new VehiclePicker(vehiclePickerHost, (preset) => physics.spawn(preset), (on) => {
  frameVisible = on;
  vehicle?.setFrameVisible(on);
}, (on) => {
  jointsVisible = on;
  vehicle?.setJointsVisible(on);
});
const showVehicle = () => {
  vehicle?.dispose();
  vehicle = new VehicleVisual(physics.layout);
  vehicle.setFrameVisible(frameVisible);
  vehicle.setJointsVisible(jointsVisible);
  scene.add(vehicle.root);
  vehiclePicker.setPreset(physics.preset);
};
physics.onVehicle = showVehicle;
showVehicle();

// ── Floating Origin (Haupt-Thread): Kamera + Terrain ─────────────
const origin = new OriginShifter();
origin.on((dx, dz) => cameraRig.shift(dx, dz));
origin.on(() => terrain.onOriginShift());

// ── Eingabe / HUD / Debug ────────────────────────────────────────
const keyboard = new Keyboard();
const hud = new TelemetryHud(document.querySelector<HTMLDivElement>('#hud')!);
const debug = new DebugToggles(stage, terrain, physics, keyboard, (params.get('debug') ?? '').split(','));
Object.assign(window, {
  __dbg: { ...stage, physics, terrain, origin, ORIGIN, debug, get vehicle() { return vehicle; } },
});

function handleHotkeys(): void {
  if (keyboard.consume('KeyR')) physics.spawn(physics.preset);
}

// ── Loop ─────────────────────────────────────────────────────────
let last = performance.now();
let fps = 0;
renderer.setAnimationLoop((now: number) => {
  const frameMs = now - last;
  const dt = Math.min(0.1, frameMs / 1000);
  last = now;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;

  handleHotkeys();
  debug.update(frameMs);
  physics.setInput(keyboard.read());

  const v = vehicle!;
  const s = physics.sample(wallClock());
  if (s && s[0] === physics.gen) {
    v.apply(s);
    const c = v.chassis.position;
    if (origin.update(c.x, c.z)) v.apply(s); // nach Shift neu in lokale Koordinaten
  }

  cameraRig.follow(v.chassis.position);
  sun.follow(v.chassis.position);
  terrain.update(camera.position.x, camera.position.y, camera.position.z);

  hud.update(v, dt, fps, terrain.stats, ORIGIN, physics, debug.summary);
  terrain.beforeRender(renderer, camera);
  renderer.render(scene, camera);
});

const label = document.querySelector('#hud-label');
if (label)
  label.textContent = `${gpuBackendLabel(renderer)} · Rapier SIMD (${physics.mode === 'worker' ? 'Worker' : 'Main'}) · ${import.meta.env.DEV ? 'dev' : 'build'}`;
}

boot().catch((err) => {
  console.error(err);
  const label = document.querySelector('#hud-label');
  if (label) label.textContent = `Start fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
});
