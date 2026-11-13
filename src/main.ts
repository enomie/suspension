import './style.css';
import { AmbientLight, Color, Fog, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initRapier } from './physics/rapierWorld';
import { LodTerrain } from './terrain/lodTerrain';
import { VIEW_DISTANCE } from './terrain/terrainConfig';
import { ORIGIN } from './world/origin';
import { OriginShifter } from './world/originShift';
import { CameraRig } from './app/cameraRig';
import { SunRig } from './app/sunRig';
import { Keyboard } from './input/keyboard';
import { PRESETS } from './vehicle/presets';
import { TelemetryHud } from './debug/telemetry';
import { PhysicsClient } from './sim/PhysicsClient';
import { VehicleView } from './sim/VehicleView';
import { wallClock } from './sim/snapshot';

/*
 * Verdrahtung. Physik läuft im Worker (src/sim/physicsWorker.ts) mit eigenem 120-Hz-Takt.
 * Ablauf pro Frame (animate):
 *   1. Hotkeys / Input → Worker   2. interpolierten Snapshot holen (Zeit = now − delay)
 *   3. Fahrzeug-Meshes setzen   4. Floating-Origin (Haupt-Thread, eigener ORIGIN)
 *   5. Kamera + Sonne folgen   6. LOD-Terrain   7. HUD + Render
 */

// ── Szene / Renderer ─────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
const scene = new Scene();
const SKY = 0x9cc4ea;
scene.background = new Color(SKY);
scene.fog = new Fog(SKY, VIEW_DISTANCE * 0.12, VIEW_DISTANCE);

const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.3, VIEW_DISTANCE * 1.1);
/** Reversed-Z: hohe Tiefenpräzision von 0,3 m bis > 30 km (kein Z-Fighting / Flimmern) */
const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, powerPreference: 'high-performance' });
const params = new URLSearchParams(location.search);
/** ?dpr=1 senkt die Auflösung (Fill-Rate) */
renderer.setPixelRatio(Math.min(devicePixelRatio, Number(params.get('dpr') ?? 2)));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
const cameraRig = new CameraRig(camera, controls);

const sun = new SunRig();
scene.add(new AmbientLight(0xb0c8e8, 0.35), sun.light, sun.light.target);

// ── Welt ─────────────────────────────────────────────────────────
/** ?x=…&z=… = absolute Startposition [m] */
ORIGIN.x = Number(params.get('x') ?? 0);
ORIGIN.z = Number(params.get('z') ?? 0);

const terrain = new LodTerrain();
scene.add(terrain.root);

// ── Physik (Worker; ?worker=0 → Haupt-Thread) ────────────────────
const R = await initRapier();
const physics = await PhysicsClient.create({
  preset: 0,
  x: ORIGIN.x,
  z: ORIGIN.z,
  useWorker: params.get('worker') !== '0',
  R,
});
/** leere Welt nur für den Fahrzeug-Aufbau (Struktur + Meshes), wird nie gesteppt */
const viewWorld = new R.World({ x: 0, y: 0, z: 0 });
let vehicle = new VehicleView(R, viewWorld, PRESETS[physics.preset]);
physics.cornerCount = vehicle.built.corners.length;
vehicle.built.root.visible = false; // bis der erste Snapshot da ist
scene.add(vehicle.built.root);

physics.onSpawn = (_gen, preset) => {
  vehicle.dispose();
  vehicle = new VehicleView(R, viewWorld, PRESETS[preset]);
  physics.cornerCount = vehicle.built.corners.length;
  vehicle.built.root.visible = false;
  scene.add(vehicle.built.root);
};

// ── Floating Origin (Haupt-Thread): Kamera + Terrain ─────────────
const origin = new OriginShifter(null);
origin.on((dx, dz) => cameraRig.shift(dx, dz));
origin.on(() => terrain.onOriginShift());

// ── Eingabe / HUD / Debug ────────────────────────────────────────
const keyboard = new Keyboard();
const hud = new TelemetryHud(document.querySelector<HTMLDivElement>('#hud')!);
Object.assign(window, {
  __dbg: {
    physics,
    terrain,
    origin,
    ORIGIN,
    camera,
    controls,
    renderer,
    scene,
    sun,
    get vehicle() {
      return vehicle;
    },
  },
});

function handleHotkeys(): void {
  if (keyboard.consume('KeyR')) physics.spawn(physics.preset);
  PRESETS.forEach((_, i) => {
    if (keyboard.consume(`Digit${(i + 1) % 10}`)) physics.spawn(i);
  });
}

await renderer.init();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── Loop ─────────────────────────────────────────────────────────
let last = performance.now();
let fps = 0;
function animate(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;

  handleHotkeys();
  physics.setInput(keyboard.read());

  const s = physics.sample(wallClock());
  if (s && s[0] === physics.gen) {
    vehicle.apply(s);
    vehicle.built.root.visible = true;
    const c = vehicle.built.chassisMesh.position;
    if (origin.update(c.x, c.z)) vehicle.apply(s); // nach Shift neu in lokale Koordinaten
  }

  const focus = vehicle.built.chassisMesh.position;
  cameraRig.follow(focus);
  sun.follow(focus);
  terrain.update(camera.position.x, camera.position.y, camera.position.z);

  hud.update(vehicle, dt, fps, terrain.stats, ORIGIN, physics);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

const label = document.querySelector('#hud-label');
if (label) label.textContent = `WebGPU · Rapier SIMD (${physics.mode === 'worker' ? 'Worker' : 'Main'}) · ${import.meta.env.DEV ? 'dev' : 'build'} · Port 9897`;
