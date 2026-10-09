import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRIDGE, FENCE, PAGODA, SHISHI, TEMPLE, TSUKUBAI, WALL, groundHeight, smoothstep } from './layout';
import { applyEdoMaterials } from './materials';
import { mulberry } from './scenery';
import { withWorldPos } from './shaders';
import { HORIZON } from './sky';

const loader = new GLTFLoader();
const load = async (name: string) => (await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)).scene;

function node(root: THREE.Object3D, name: string) {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`missing ${name}`);
  return o;
}

function place(o: THREE.Object3D, x: number, z: number, ry = 0, s = 1, dy = 0) {
  o.position.set(x, groundHeight(x, z) + dy, z);
  o.rotation.y = ry;
  o.scale.setScalar(s);
  return o;
}

function waterStream(from: THREE.Vector3, to: THREE.Vector3, radius = 0.006) {
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(radius, radius * 1.4, len, 6, 1, true);
  geo.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#dfeef0', roughness: 0.05, transparent: true, opacity: 0.55 }),
  );
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  return mesh;
}

// ---------------------------------------------------------------- buildings
export async function createTemple(scene: THREE.Scene) {
  const temple = await load('temple');
  applyEdoMaterials(temple);
  place(temple, TEMPLE.x, TEMPLE.z, -Math.PI / 2);
  temple.position.y = 0;
  scene.add(temple);
}

export async function createFence(scene: THREE.Scene) {
  const root = await load('fence');
  applyEdoMaterials(root);
  const seg = node(root, 'FenceSeg');
  const gate = node(root, 'Gate');
  const SEG = 1.8;
  const put = (x: number, z: number, ry: number) => {
    const s = seg.clone();
    s.position.set(x, groundHeight(x, z), z);
    s.rotation.y = ry;
    scene.add(s);
  };
  // back run, from the end of the clay wall to the corner
  for (let x = WALL.x1 + SEG / 2; x < FENCE.x; x += SEG) put(x, FENCE.z0, 0);
  // right run, with a gap for the gate
  for (let z = FENCE.z0 + SEG / 2; z < FENCE.z1; z += SEG) {
    if (Math.abs(z - FENCE.gateZ) < 1.7) continue;
    put(FENCE.x, z, Math.PI / 2);
  }
  place(gate, FENCE.x, FENCE.gateZ, Math.PI / 2);
  scene.add(gate);
}

export async function createBridge(scene: THREE.Scene) {
  const bridge = await load('bridge');
  applyEdoMaterials(bridge);
  bridge.position.set(BRIDGE.x, 0, BRIDGE.z);
  scene.add(bridge);
}

export async function createPagoda(scene: THREE.Scene) {
  const pagoda = await load('pagoda');
  applyEdoMaterials(pagoda, false);
  place(pagoda, PAGODA.x, PAGODA.z, 0.3, 1.25, -0.5);
  scene.add(pagoda);
}

const PINES: [string, number, number, number, number][] = [
  ['PineA', 6.9, -5.4, 0.6, 1.0],
  ['PineB', 14.0, 6.6, 2.4, 1.0],
  ['PineA', -8.6, -8.6, 3.5, 0.85],
];

export async function createPines(scene: THREE.Scene) {
  const root = await load('pine');
  applyEdoMaterials(root);
  for (const [name, x, z, ry, s] of PINES) {
    const g = new THREE.Group();
    g.add(node(root, name).clone(), node(root, `${name}_needles`).clone());
    scene.add(place(g, x, z, ry, s));
  }
}

// ---------------------------------------------------------------- water features
// Shishi-odoshi cycle: fill (mouth sinks slowly), tip and pour, swing back and knock.
export async function createWaterFeatures(scene: THREE.Scene) {
  const root = await load('tsukubai');
  applyEdoMaterials(root);
  const basin = node(root, 'Tsukubai');
  place(basin, TSUKUBAI.x, TSUKUBAI.z, TSUKUBAI.ry);
  scene.add(basin);
  basin.add(waterStream(new THREE.Vector3(0, 0.5, 0.08), new THREE.Vector3(0, 0.3, 0.12)));

  const base = node(root, 'ShishiBase');
  const tube = node(root, 'ShishiTube');
  const group = new THREE.Group();
  group.add(base, tube);
  tube.position.set(0, 0.45, 0);
  group.add(waterStream(new THREE.Vector3(0.36, 0.82, 0), new THREE.Vector3(0.38, 0.52, 0)));
  scene.add(place(group, SHISHI.x, SHISHI.z, SHISHI.ry));

  const REST = 0.55;
  const TIP = -0.08;
  const DOWN = -0.55;
  let state: 'fill' | 'tip' | 'pour' | 'back' = 'fill';
  let t = 0;
  let angle = REST;
  return (dt: number): boolean => {
    t += dt;
    let knock = false;
    if (state === 'fill') {
      const k = Math.min(1, t / 7);
      angle = REST + (TIP - REST) * k * k * k;
      if (k >= 1) [state, t] = ['tip', 0];
    } else if (state === 'tip') {
      const k = Math.min(1, t / 0.35);
      angle = TIP + (DOWN - TIP) * (1 - (1 - k) * (1 - k));
      if (k >= 1) [state, t] = ['pour', 0];
    } else if (state === 'pour') {
      if (t > 0.6) [state, t] = ['back', 0];
    } else {
      const k = Math.min(1, t / 0.28);
      angle = DOWN + (REST - DOWN) * k * k;
      if (k >= 1) {
        knock = true;
        [state, t] = ['fill', 0];
      }
    }
    tube.rotation.z = angle;
    return knock;
  };
}

// ---------------------------------------------------------------- cedar grove
// Japanese cedars (sugi) ring the temple grounds behind the wall, fence and hall.
export function createForest(scene: THREE.Scene, count: number) {
  // Crown: lumpy foliage clusters stacked in a narrow spire.
  const crownParts: THREE.BufferGeometry[] = [];
  const crnd = mulberry(29);
  for (let k = 0; k < 15; k++) {
    const t = k / 14;
    const r = 1.7 * (1 - t * 0.82);
    const a = crnd() * Math.PI * 2;
    const blob = new THREE.IcosahedronGeometry(0.55 + r * 0.6, 1);
    blob.scale(1, 0.7, 1);
    blob.translate(Math.cos(a) * r * 0.45, 3.2 + t * 8.2, Math.sin(a) * r * 0.45);
    crownParts.push(blob);
  }
  const crown = mergeGeometries(crownParts);
  const trunk = new THREE.CylinderGeometry(0.12, 0.28, 6, 7);
  trunk.translate(0, 3, 0);

  const leaf = new THREE.MeshStandardMaterial({ color: '#1f3318', roughness: 0.95, side: THREE.DoubleSide });
  leaf.onBeforeCompile = (s) => {
    withWorldPos(s);
    s.fragmentShader = s.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      {
        float nz = vnoise3(vWPos * 4.0) * 0.5 + vnoise3(vWPos * 13.0) * 0.5;
        float rim = 1.0 - abs(dot(normalize(vViewPosition), normal));
        if (nz < rim * 1.2 - 0.05) discard;
        diffuseColor.rgb *= 0.55 + 0.7 * nz;
      }`,
    );
  };
  const bark = new THREE.MeshStandardMaterial({ color: '#4a3226', roughness: 1 });
  const crowns = new THREE.InstancedMesh(crown, leaf, count);
  const trunks = new THREE.InstancedMesh(trunk, bark, count);

  const rnd = mulberry(17);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 20; tries++) {
    const x = -55 + rnd() * 110;
    const z = -60 + rnd() * 80;
    const behindWall = z < WALL.z - 3.5;
    const pastFence = x > FENCE.x + 3.5 && z < 14;
    const pastTemple = x < TEMPLE.foot.x0 - 2.5 && z < 14;
    if (!(behindWall || pastFence || pastTemple)) continue;
    if (Math.hypot(x - PAGODA.x, z - PAGODA.z) < 12) continue;
    const s = 0.9 + rnd() * 0.9;
    q.setFromAxisAngle(up, rnd() * 6.28);
    m.compose(new THREE.Vector3(x, groundHeight(x, z) - 0.2, z), q, new THREE.Vector3(s, s * (0.9 + rnd() * 0.4), s));
    crowns.setMatrixAt(n, m);
    trunks.setMatrixAt(n, m);
    n++;
  }
  crowns.count = trunks.count = n;
  crowns.receiveShadow = trunks.receiveShadow = true;
  crowns.castShadow = true;
  scene.add(crowns, trunks);
}

// ---------------------------------------------------------------- distant mountains
// Layered ridges with manual aerial perspective (they sit beyond the fog range).
export function createMountains(scene: THREE.Scene) {
  const layers = [
    { r: 130, h: 34, color: '#7f9286', mist: 0.45, seed: 1.7 },
    { r: 200, h: 62, color: '#8d9fb2', mist: 0.6, seed: 4.1 },
    { r: 300, h: 95, color: '#a3b2c6', mist: 0.72, seed: 7.3 },
  ];
  const horizon = HORIZON.clone();
  for (const L of layers) {
    const seg = 220;
    const pos: number[] = [];
    const col: number[] = [];
    const base = new THREE.Color(L.color);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const n =
        0.55 * Math.sin(a * 3 + L.seed) +
        0.3 * Math.sin(a * 7.3 + L.seed * 2) +
        0.15 * Math.sin(a * 17.1 + L.seed * 3) +
        0.1 * Math.sin(a * 31.7);
      // keep the far side (behind the wall, -z) tallest
      const back = smoothstep(0.2, -0.9, Math.sin(a));
      const h = L.h * (0.35 + 0.45 * (n * 0.5 + 0.5)) * (0.55 + 0.45 * back);
      const x = Math.cos(a) * L.r;
      const z = Math.sin(a) * L.r;
      pos.push(x, -8, z, x, h, z);
      const top = base.clone().lerp(horizon, L.mist * 0.7);
      const bottom = base.clone().lerp(horizon, Math.min(1, L.mist + 0.3));
      col.push(bottom.r, bottom.g, bottom.b, top.r, top.g, top.b);
    }
    const idx: number[] = [];
    for (let i = 0; i < seg; i++) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }),
    );
    mesh.renderOrder = -0.5;
    scene.add(mesh);
  }
}
