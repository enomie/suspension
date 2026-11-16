import { AmbientLight, Color, Fog, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VIEW_DISTANCE } from '../shared/config';
import { CameraRig } from './CameraRig';
import { SunRig } from './SunRig';

const SKY = 0x9cc4ea;

/** renderer, scene, camera, light — main thread only. */
export async function createStage(container: HTMLElement, opts: { dpr: number }) {
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, VIEW_DISTANCE * 0.12, VIEW_DISTANCE);

  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.3, VIEW_DISTANCE * 1.1);
  /** reversed-Z: high depth precision from 0.3 m to > 30 km (no z-fighting / shimmer) */
  const renderer = new WebGPURenderer({ antialias: true, reversedDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, opts.dpr));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  const cameraRig = new CameraRig(camera, controls);

  const sun = new SunRig();
  scene.add(new AmbientLight(0xb0c8e8, 0.35), sun.light, sun.light.target);

  await renderer.init();
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  return { scene, camera, renderer, controls, cameraRig, sun };
}

export type Stage = Awaited<ReturnType<typeof createStage>>;

/** label: native WebGPU or WebGPURenderer WebGL fallback (Chrome without WebGPU). */
export function gpuBackendLabel(renderer: WebGPURenderer): string {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL-Fallback';
}
