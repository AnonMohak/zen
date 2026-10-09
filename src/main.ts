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
import { Q } from './quality';
import { createGrass } from './grass';
import { createGround } from './ground';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN_DIR, WATER_Y, groundHeight } from './layout';
import { createPetals } from './petals';
import { createKoi, createWater } from './pond';
import { createLantern, createRocks, createTrees, createWall } from './scenery';
import { uTime } from './shaders';
import { HORIZON, createSky, skyEnvironment } from './sky';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.dpr));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.querySelector('#app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HORIZON, 0.013);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 600);

// ---------------------------------------------------------------- light
const sky = createSky();
scene.add(sky);
scene.environment = skyEnvironment(renderer, sky);
scene.environmentIntensity = 0.45;
if (Q.hdri) {
  // Poly Haven bloem_field_sunrise (CC0) for image-based light; the painted sky stays as background.
  new HDRLoader().load(`${import.meta.env.BASE_URL}textures/bloem_field_sunrise_2k.hdr`, (hdr) => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.55;
    hdr.dispose();
    pmrem.dispose();
  });
}

const hemi = new THREE.HemisphereLight('#cfe0f2', '#9c8a6e', 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#ffdcb8', 3.6);
const sunDir = new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize();
sun.position.copy(sunDir).multiplyScalar(40);
sun.target.position.set(-3, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
const sc = sun.shadow.camera;
sc.left = -30;
sc.right = 30;
sc.top = 22;
sc.bottom = -22;
sc.near = 5;
sc.far = 90;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (Q.ao) {
  const ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
}
if (Q.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.7, 0.92));
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
let updatePetals: (dt: number, t: number) => void = () => {};
let updateKoi: (t: number) => void = () => {};
let updateShishi: (dt: number) => boolean = () => false;

async function build() {
  const islands = await createRocks(scene);
  scene.add(createGround(islands));
  createWall(scene);
  createWater(scene);
  createGrass(scene, Q.grass);
  createMountains(scene);
  createForest(scene, Q.forest);
  const [spawn, koi, shishi] = await Promise.all([
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
  updateKoi = koi;
  updateShishi = shishi;
  updatePetals = createPetals(scene, spawn, Q.petals);
  renderer.compile(scene, camera);
  status.classList.add('done');
}
build().catch((err) => {
  console.error(err);
  status.textContent = 'Could not load the garden.';
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

if (import.meta.env.DEV) Object.assign(window, { camera, controls, scene, renderer });

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
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed() + T0;
  uTime.value = t;
  controls.update(dt);
  constrainCamera();
  updateKoi(t);
  if (updateShishi(dt) && soundOn) ambience?.knock();
  updatePetals(dt, t);
  composer.render();
});
