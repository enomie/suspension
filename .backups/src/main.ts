import './style.css';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrainMesh } from './terrain/createTerrainMesh';
import { createHeightfieldCollider } from './physics/createHeightfieldCollider';
import { createPhysicsWorld, initRapier } from './physics/rapierWorld';
import { sampleTerrainHeightWorld } from './terrain/generateHeights';
import { Keyboard } from './input/keyboard';
import { Vehicle } from './vehicle/Vehicle';
import { PRESETS } from './vehicle/presets';
import { TelemetryHud } from './debug/telemetry';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('#app missing');
}

const scene = new Scene();
scene.background = new Color(0x87b8e8);

const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 500);
camera.position.set(45, 35, 55);

const renderer = new WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

const hemi = new AmbientLight(0xb0c8e8, 0.35);
scene.add(hemi);

const sun = new DirectionalLight(0xfff4e0, 1.4);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

const terrain = createTerrainMesh();
scene.add(terrain);

const R = await initRapier();
const world = createPhysicsWorld(R);
createHeightfieldCollider(world, R);

const keyboard = new Keyboard();
let spec = PRESETS[0];
function spawnPoint(): { x: number; y: number; z: number } {
  return { x: 0, y: sampleTerrainHeightWorld(0, 0) + 1.2, z: 0 };
}
let vehicle = new Vehicle(R, world, spec, spawnPoint());
scene.add(vehicle.built.root);

const hudEl = document.querySelector<HTMLDivElement>('#hud')!;
const hud = new TelemetryHud(hudEl);
(window as unknown as { __dbg: unknown }).__dbg = { world, get vehicle() { return vehicle; } };

function resetVehicle(): void {
  vehicle.dispose();
  vehicle = new Vehicle(R, world, spec, spawnPoint());
  scene.add(vehicle.built.root);
}

await renderer.init();

const clock = { last: performance.now() };

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);

/** Fester Physik-Takt 120 Hz, max. 4 Substeps pro Frame. */
const PHYSICS_DT = 1 / 120;
world.timestep = PHYSICS_DT;
world.numSolverIterations = 8;
let accumulator = 0;

function stepPhysics(dt: number): void {
  if (keyboard.consume('KeyR')) resetVehicle();
  PRESETS.forEach((p, i) => {
    if (keyboard.consume(`Digit${(i + 1) % 10}`)) {
      spec = p;
      resetVehicle();
    }
  });
  accumulator = Math.min(accumulator + dt, PHYSICS_DT * 4);
  const input = keyboard.read();
  while (accumulator >= PHYSICS_DT) {
    vehicle.applyInput(input, PHYSICS_DT);
    world.step();
    accumulator -= PHYSICS_DT;
  }
  vehicle.updateTelemetry();
  vehicle.syncMeshes();
}

/** Kamera folgt dem Chassis (Orbit bleibt frei). */
const lastTarget = new Vector3();
function followCamera(): void {
  const t = vehicle.chassis.translation();
  const delta = new Vector3(t.x, t.y, t.z).sub(lastTarget);
  if (lastTarget.lengthSq() === 0) {
    camera.position.set(t.x + 6, t.y + 4, t.z + 9);
  } else {
    camera.position.add(delta);
  }
  controls.target.set(t.x, t.y, t.z);
  lastTarget.set(t.x, t.y, t.z);
}

let fps = 0;
function animate(now: number): void {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - clock.last) / 1000);
  clock.last = now;
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
  stepPhysics(dt);
  followCamera();
  controls.update();
  hud.update(vehicle, dt, fps);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

const label = document.querySelector('#hud-label');
if (label) {
  label.textContent = `WebGPU · Rapier SIMD · ${import.meta.env.DEV ? 'dev' : 'build'} · 100×100 m · Port 9897`;
}
