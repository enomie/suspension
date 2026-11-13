import './style.css';
import { AmbientLight, Color, Fog, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPhysicsWorld, initRapier } from './physics/rapierWorld';
import { LodTerrain } from './terrain/lodTerrain';
import { PhysicsTiles } from './terrain/physicsTiles';
import { sampleTerrainHeightWorld } from './terrain/generateHeights';
import { ORIGIN } from './world/origin';
import { OriginShifter } from './world/originShift';
import { FixedStep } from './app/fixedStep';
import { CameraRig } from './app/cameraRig';
import { SunRig } from './app/sunRig';
import { Keyboard } from './input/keyboard';
import { Vehicle } from './vehicle/Vehicle';
import { PRESETS } from './vehicle/presets';
import { TelemetryHud } from './debug/telemetry';

/*
 * Verdrahtung. Ablauf pro Frame (animate):
 *   1. Hotkeys   2. Physik-Kacheln um Fahrzeug   3. fester Physik-Takt (120 Hz)
 *   4. Telemetrie   5. Floating-Origin-Shift   6. Visuals interpoliert
 *   7. Kamera + Sonne folgen   8. LOD-Terrain   9. HUD + Render
 */

// ── Szene / Renderer ─────────────────────────────────────────────
const app = document.querySelector<HTMLDivElement>('#app')!;
const scene = new Scene();
scene.background = new Color(0x87b8e8);
scene.fog = new Fog(0x87b8e8, 1500, 9000);

const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 12000);
/** Reversed-Z: hohe Tiefenpräzision von 0,3 m bis 12 km (kein Z-Fighting / Flimmern) */
const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
const params = new URLSearchParams(location.search);
/** ?x=…&z=… = absolute Startposition [m] */
ORIGIN.x = Number(params.get('x') ?? 0);
ORIGIN.z = Number(params.get('z') ?? 0);

const terrain = new LodTerrain();
scene.add(terrain.root);

const R = await initRapier();
const world = createPhysicsWorld(R);
const step = new FixedStep(1 / 120, 4);
world.timestep = step.dt;
world.numSolverIterations = 8;
const physicsTiles = new PhysicsTiles(R, world);

// ── Fahrzeug ─────────────────────────────────────────────────────
let spec = PRESETS[0];
function spawnPoint(lx = 0, lz = 0) {
  physicsTiles.update(lx, lz);
  return { x: lx, y: sampleTerrainHeightWorld(lx + ORIGIN.x, lz + ORIGIN.z) + 1.2, z: lz };
}
let vehicle = new Vehicle(R, world, spec, spawnPoint());
scene.add(vehicle.built.root);

function respawn(): void {
  const t = vehicle.chassis.translation();
  vehicle.dispose();
  vehicle = new Vehicle(R, world, spec, spawnPoint(t.x, t.z));
  scene.add(vehicle.built.root);
}

// ── Floating Origin: alle Teilnehmer an einer Stelle ─────────────
const origin = new OriginShifter(world);
origin.on((dx, dz) => vehicle.poses.shift(dx, dz));
origin.on((dx, dz) => cameraRig.shift(dx, dz));
origin.on(() => terrain.onOriginShift());

// ── Eingabe / HUD / Debug ────────────────────────────────────────
const keyboard = new Keyboard();
const hud = new TelemetryHud(document.querySelector<HTMLDivElement>('#hud')!);
Object.assign(window, {
  __dbg: { world, terrain, physicsTiles, origin, ORIGIN, camera, controls, renderer, scene, sun, get vehicle() { return vehicle; } },
});

function handleHotkeys(): void {
  if (keyboard.consume('KeyR')) respawn();
  PRESETS.forEach((p, i) => {
    if (keyboard.consume(`Digit${(i + 1) % 10}`)) {
      spec = p;
      respawn();
    }
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
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;

  handleHotkeys();
  const vt = vehicle.chassis.translation();
  physicsTiles.update(vt.x, vt.z);

  const input = keyboard.read();
  const alpha = step.advance(dt, () => {
    vehicle.applyInput(input, step.dt);
    vehicle.poses.capture();
    world.step();
  });
  vehicle.updateTelemetry();

  const ct = vehicle.chassis.translation();
  origin.update(ct.x, ct.z);
  vehicle.syncMeshes(alpha);

  const focus = vehicle.built.chassisMesh.position; // interpoliert
  cameraRig.follow(focus);
  sun.follow(focus);
  terrain.update(camera.position.x, camera.position.y, camera.position.z);

  hud.update(vehicle, dt, fps, terrain.stats, ORIGIN);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

const label = document.querySelector('#hud-label');
if (label) label.textContent = `WebGPU · Rapier SIMD · ${import.meta.env.DEV ? 'dev' : 'build'} · Port 9897`;
