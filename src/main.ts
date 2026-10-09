import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createAmbience } from './audio';
import { createBridge, createFence, createForest, createMountains, createPagoda, createPines, createTemple, createWaterFeatures } from './edo';
import { upgradeTextures } from './materials';
import { Q, refineForGpu } from './quality';
import { createGrass } from './grass';
import { createGround } from './ground';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN_DIR, WATER_Y, groundHeight } from './layout';
import { createPetals } from './petals';
import { createKoi, createWater } from './pond';
import { createLantern, createRocks, createTrees, createWall } from './scenery';
import { uTime } from './shaders';
import { HORIZON, createSky, skyEnvironment } from './sky';

// Let the browser paint the loading art before the heavy WebGL setup starts.
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
refineForGpu(renderer.getContext() as WebGL2RenderingContext);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.dpr));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Skipping the per-shader error check lets the GPU compile shaders in parallel
// instead of stalling the main thread on each one (huge on Windows/ANGLE).
renderer.debug.checkShaderErrors = import.meta.env.DEV;
document.querySelector('#app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HORIZON, 0.013);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 600);

// ---------------------------------------------------------------- light
const sky = createSky();
scene.add(sky);
// Image-based light: Poly Haven bloem_field_sunrise (CC0) on desktop, the painted
// sky on phones. Only one is ever set, so shaders compile once for one env map.
const environmentReady = Q.hdri
  ? new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}textures/bloem_field_sunrise_1k.hdr`).then((hdr) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentIntensity = 0.55;
      hdr.dispose();
      pmrem.dispose();
    })
  : Promise.resolve().then(() => {
      scene.environment = skyEnvironment(renderer, sky);
      scene.environmentIntensity = 0.45;
    });

const hemi = new THREE.HemisphereLight('#cfe0f2', '#9c8a6e', 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#ffdcb8', 3.6);
const sunDir = new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize();
sun.position.copy(sunDir).multiplyScalar(40);
sun.target.position.set(-3, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
const sc = sun.shadow.camera;
sc.left = -26;
sc.right = 26;
sc.top = 20;
sc.bottom = -20;
sc.near = 5;
sc.far = 90;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let ao: GTAOPass | null = null;
let bloom: UnrealBloomPass | null = null;
if (Q.ao) {
  ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  // Half resolution: AO is soft, and this quarters its cost.
  const aoSetSize = ao.setSize.bind(ao);
  ao.setSize = (w: number, h: number) => aoSetSize(Math.ceil(w / 2), Math.ceil(h / 2));
  ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
  ao.blendIntensity = 0.85;
  // The AO pass re-renders the scene; skip grass, cedars and petals (tagged
  // userData.noAO), whose contact shadows are invisible but cost millions of triangles.
  const aoRender = ao.render.bind(ao);
  ao.setSize(window.innerWidth, window.innerHeight);
  const skipped: THREE.Object3D[] = [];
  ao.render = (...args: Parameters<GTAOPass['render']>) => {
    scene.traverseVisible((o) => {
      if (o.userData.noAO) skipped.push(o);
    });
    for (const o of skipped) o.visible = false;
    aoRender(...args);
    for (const o of skipped) o.visible = true;
    skipped.length = 0;
  };
  composer.addPass(ao);
}
if (Q.bloom) {
  bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.7, 0.92);
  // Bloom is a blur, so half resolution looks the same.
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w: number, h: number) => bloomSetSize(Math.ceil(w / 2), Math.ceil(h / 2));
  bloom.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(bloom);
}
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 0.99, 0.97), 0.6);
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- world
const status = document.querySelector<HTMLDivElement>('#loading')!;
const bar = document.querySelector<HTMLDivElement>('#progress')!;
const manager = THREE.DefaultLoadingManager;
let pending = 0;
let onIdle: (() => void) | null = null;
manager.onProgress = (_url, loaded, total) => {
  pending = total - loaded;
  bar.style.transform = `scaleX(${loaded / total})`;
};
manager.onLoad = () => {
  pending = 0;
  onIdle?.();
};
const texturesReady = () => (pending === 0 ? Promise.resolve() : new Promise<void>((r) => (onIdle = r)));
let updatePetals: (dt: number, t: number) => void = () => {};
let updateKoi: (t: number) => void = () => {};
let updateShishi: (dt: number) => boolean = () => false;

// Nothing is drawn until every shader is compiled; drawing earlier would compile
// them one by one on the main thread as objects appear.
let ready = false;
// Instanced meshes the quality ladder may thin out (grass tiles, cedars).
const thinnable: THREE.InstancedMesh[] = [];

async function build() {
  // Start every download at once; the ground waits only for the rock positions.
  const rocks = createRocks(scene);
  const parts = Promise.all([
    createTrees(scene),
    createKoi(scene),
    createWaterFeatures(scene),
    createLantern(scene),
    createTemple(scene),
    createFence(scene),
    createBridge(scene),
    createPagoda(scene),
    createPines(scene),
  ]);
  scene.add(createGround(await rocks));
  createWall(scene);
  createWater(scene);
  thinnable.push(...createGrass(scene, Q.grass));
  createMountains(scene);
  thinnable.push(...createForest(scene, Q.forest));
  const [spawn, koi, shishi] = await parts;
  updateKoi = koi;
  updateShishi = shishi;
  updatePetals = createPetals(scene, spawn, Q.petals);
  await Promise.all([texturesReady(), environmentReady]);
  // Compile for the composer's render target (no tone mapping, linear output),
  // which is what the first frame uses; otherwise every shader compiles twice.
  renderer.setRenderTarget(composer.renderTarget1);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  // The first frame still links shadow and post-processing shaders; draw it while
  // the loading art is fully visible so the fade-out stays smooth.
  composer.render();
  ready = true;
  status.classList.add('done');
  // Sharper textures stream in after the fade.
  setTimeout(upgradeTextures, 2500);
}
build().catch((err) => {
  console.error(err);
  status.querySelector('.caption')!.textContent = 'Could not load the garden.';
});

// ---------------------------------------------------------------- camera
// Orbit controls that never dip below the ground or leave the garden.
camera.position.set(9, 4.6, 17.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-2, 1.2, -1);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.5;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI / 2 - 0.06;
controls.screenSpacePanning = false;
const TARGET_MIN = new THREE.Vector3(-22, 0.3, -12);
const TARGET_MAX = new THREE.Vector3(16, 4, 12);
const CAMERA_CLEARANCE = 0.45;

// Debug handle for profiling scripts: dev builds, or any build with ?debug.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { camera, controls, __three: { scene, renderer, composer, Q } });
}

function constrainCamera() {
  controls.target.clamp(TARGET_MIN, TARGET_MAX);
  const floor = Math.max(groundHeight(camera.position.x, camera.position.z), WATER_Y) + CAMERA_CLEARANCE;
  if (camera.position.y < floor) camera.position.y = floor;
}

// ---------------------------------------------------------------- sound toggle
const soundBtn = document.querySelector<HTMLButtonElement>('#sound')!;
let ambience: ReturnType<typeof createAmbience> | null = null;
let soundOn = false;
soundBtn.addEventListener('click', () => {
  ambience ??= createAmbience();
  soundOn = !soundOn;
  ambience.setOn(soundOn);
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
});

// ---------------------------------------------------------------- loop
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
timer.connect(document);
const T0 = 40;
// Adaptive quality ladder: when the frame rate stays low, drop the costliest
// effect with the least visible change first; climb back when there is headroom.
type Level = { ao: boolean; bloom: boolean; dpr: number; density: number };
const DPR_MAX = Math.min(window.devicePixelRatio, Q.dpr);
const ladder: Level[] = [{ ao: !!ao, bloom: !!bloom, dpr: DPR_MAX, density: 1 }];
const step = (change: Partial<Level>) => {
  const prev = ladder[ladder.length - 1];
  const next = { ...prev, ...change };
  if (JSON.stringify(next) !== JSON.stringify(prev)) ladder.push(next);
};
if (DPR_MAX > 1.5) step({ dpr: 1.5 });
if (ao) step({ ao: false });
if (DPR_MAX > 1.25) step({ dpr: 1.25 });
if (DPR_MAX >= 1) step({ dpr: 1 });
if (bloom) step({ bloom: false });
step({ density: 0.6 });
step({ dpr: Math.min(DPR_MAX, 0.85) });
step({ dpr: Math.min(DPR_MAX, 0.75) });

let level = 0;
let frames = 0;
let frameTime = 0;
let goodWindows = 0;
const fullCounts = new Map<THREE.InstancedMesh, number>();
function applyLevel(l: Level) {
  for (const m of thinnable) {
    if (!fullCounts.has(m)) fullCounts.set(m, m.count);
    m.count = Math.round(fullCounts.get(m)! * l.density);
  }
  if (ao) ao.enabled = l.ao;
  if (bloom) bloom.enabled = l.bloom;
  if (renderer.getPixelRatio() !== l.dpr) {
    renderer.setPixelRatio(l.dpr);
    composer.setPixelRatio(l.dpr);
  }
}
let graceTime = 4; // skip the fade-in and the first texture uploads
function adaptQuality(rawDt: number) {
  if ((graceTime -= rawDt) > 0) return;
  frames++;
  frameTime += rawDt;
  if (frameTime < 2) return;
  const fps = frames / frameTime;
  frames = frameTime = 0;
  if (document.visibilityState !== 'visible') return;
  if (fps < 40 && level < ladder.length - 1) {
    applyLevel(ladder[++level]);
    goodWindows = 0;
  } else if (fps > 58 && level > 0 && ++goodWindows >= 3) {
    applyLevel(ladder[--level]);
    goodWindows = 0;
  }
}

renderer.setAnimationLoop((now) => {
  timer.update(now);
  if (!ready) return;
  const rawDt = timer.getDelta();
  adaptQuality(rawDt);
  const dt = Math.min(rawDt, 1 / 20);
  const t = timer.getElapsed() + T0;
  uTime.value = t;
  controls.update(dt);
  constrainCamera();
  updateKoi(t);
  if (updateShishi(dt) && soundOn) ambience?.knock();
  updatePetals(dt, t);
  composer.render();
});
