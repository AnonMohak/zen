import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LANTERN, POND, SAND, SAND_ROCKS, WALL, groundHeight } from './layout';
import { pbr, regrade } from './materials';
import { stoneDetail, swayVertex, uTime, withWorldPos } from './shaders';
import { flowerTexture, wallTexture } from './textures';

const loader = new GLTFLoader();
const load = (name: string) => loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);

function meshes(root: THREE.Object3D) {
  const out: Record<string, THREE.Mesh> = {};
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out[o.name] = o as THREE.Mesh;
  });
  return out;
}

function swayMaterial(params: THREE.MeshStandardMaterialParameters, base: number, flutter: number, lacy = false) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${swayVertex(base, flutter)}`);
    if (!lacy) return;
    // Blossom clumps: mottled colour, and a ragged, see-through silhouette.
    withWorldPos(s);
    s.fragmentShader = s.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      /* glsl */ `#include <normal_fragment_begin>
      {
        float nz = vnoise3(vWPos * 22.0) * 0.65 + vnoise3(vWPos * 61.0) * 0.35;
        float rim = 1.0 - abs(dot(normalize(vViewPosition), normal));
        if (nz < rim * 1.5 - 0.12 || nz < 0.3) discard;
        diffuseColor.rgb *= 0.72 + 0.45 * nz;
      }`,
    );
  };
  return mat;
}

// ---------------------------------------------------------------- trees
const TREE_SPOTS: [string, number, number, number, number][] = [
  // model, x, z, yaw, scale
  ['cherrya', -5.6, -9.2, 0.4, 1.15],
  ['cherryc', 2.0, -9.8, 2.2, 1.0],
  ['cherryb', 12.4, -1.6, -2.4, 1.1],
  ['cherryb', 19.0, -9.5, 1.0, 1.25],
  ['cherryc', -13.0, -17.0, 4.2, 1.3],
  ['cherryb', 7.0, -19.0, 0.8, 1.35],
  ['cherrya', 21.0, 3.0, 2.7, 1.1],
  ['cherryc', -27.0, 6.0, 1.4, 1.2],
  ['cherryb', -6.2, 9.8, 0.9, 1.15],
];

export async function createTrees(scene: THREE.Scene) {
  // Tree UVs: one unit is 0.3 m around the trunk and 0.6 m along it.
  const bark = pbr('bark_brown_02', 1);
  for (const t of Object.values(bark)) t.repeat.set(0.3, 0.6);
  const barkMat = swayMaterial({ ...bark, color: '#b59a90' }, 1.6, 0);
  const blossomMat = swayMaterial(
    { vertexColors: true, roughness: 0.85, emissive: new THREE.Color('#ff9fb6'), emissiveIntensity: 0.08 },
    1.6,
    0.004,
    true,
  );
  const flowerMat = swayMaterial(
    {
      map: flowerTexture(),
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8,
      emissive: new THREE.Color('#ffc8d6'),
      emissiveIntensity: 0.1,
    },
    1.6,
    0.006,
  );

  const models: Record<string, THREE.Group> = {};
  for (const name of ['cherrya', 'cherryb', 'cherryc']) {
    const g = (await load(name)).scene;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.name.endsWith('_bark')) m.material = barkMat;
      else if (m.name.endsWith('_blossom')) m.material = blossomMat;
      else m.material = flowerMat;
      m.castShadow = !m.name.endsWith('_flowers');
      m.receiveShadow = true;
    });
    models[name] = g;
  }

  // Blossom vertices in world space, used as spawn points for falling petals.
  const spawn: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (const [name, x, z, yaw, s] of TREE_SPOTS) {
    const t = models[name].clone();
    t.position.set(x, groundHeight(x, z), z);
    t.rotation.y = yaw;
    t.scale.setScalar(s);
    scene.add(t);
    t.updateMatrixWorld(true);
    // Only the nearer trees drop petals into view.
    if (Math.hypot(x, z) > 20) continue;
    const b = meshes(t)[`${name === 'cherrya' ? 'CherryA' : name === 'cherryb' ? 'CherryB' : 'CherryC'}_blossom`];
    const p = b.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 7) spawn.push(v.fromBufferAttribute(p, i).applyMatrix4(b.matrixWorld).clone());
  }
  return spawn;
}

// ---------------------------------------------------------------- rocks
// Photo-scanned mossy rocks (Poly Haven rock_moss_set_02, CC0) keep their own textures.
export async function createRocks(scene: THREE.Scene) {
  const root = (await load('rocks_scan')).scene;
  const scans = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const o = root.getObjectByName(`Scan${i}`)!;
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    return o;
  });
  const rockAt = (i: number, x: number, y: number, z: number, ry: number, s: THREE.Vector3Tuple) => {
    const m = scans[i].clone();
    m.position.set(x, y, z);
    m.rotation.set(0, ry, 0);
    m.scale.set(...s);
    scene.add(m);
    return m;
  };

  const islands: THREE.Vector3[] = [];
  const box = new THREE.Box3();
  for (const r of SAND_ROCKS) {
    const m = rockAt(r.i, r.x, -0.02, r.z, r.ry, [r.s, r.s, r.s]);
    m.updateMatrixWorld(true);
    box.setFromObject(m);
    const rad = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
    islands.push(new THREE.Vector3(r.x, r.z, rad * 0.85));
  }

  // Stones around the pond edge.
  const rnd = mulberry(5);
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + rnd() * 0.15;
    if (a > 2.7 && a < 3.5) continue; // leave a gap facing the lantern
    if (Math.abs(Math.sin(a)) > 0.93) continue; // and where the bridge lands
    const e = 1.02 + rnd() * 0.06;
    const x = POND.cx + Math.cos(a) * POND.rx * e;
    const z = POND.cz + Math.sin(a) * POND.rz * e;
    const s = 0.22 + rnd() * 0.16;
    rockAt([0, 5, 1, 2][k % 4], x, groundHeight(x, z) - 0.06, z, rnd() * 6.28, [s, s * (0.7 + rnd() * 0.5), s]);
  }

  // Flat stepping stones from the sand edge past the lantern.
  for (let k = 0; k < 4; k++) {
    rockAt(5, 5.6 + (k % 2) * 0.3, -0.12, -2.4 - k * 0.9, k, [0.32, 0.12, 0.3]);
  }
  return islands;
}

// ---------------------------------------------------------------- lantern
export async function createLantern(scene: THREE.Scene) {
  const src = meshes((await load('lantern')).scene);
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  stoneDetail(stone, 14, 0.5);
  const lantern = new THREE.Group();
  const body = src.Lantern;
  body.material = stone;
  body.castShadow = body.receiveShadow = true;
  const glow = src.LanternGlow;
  glow.material = new THREE.MeshStandardMaterial({ color: '#2a1c10', emissive: '#ffb066', emissiveIntensity: 1.6 });
  lantern.add(body, glow);
  const { x, z } = LANTERN;
  lantern.position.set(x, groundHeight(x, z) - 0.02, z);
  lantern.rotation.y = 0.4;
  lantern.scale.setScalar(1.15);
  scene.add(lantern);
  const light = new THREE.PointLight('#ffb36b', 0.6, 4, 2);
  light.position.set(x, 1.45, z);
  scene.add(light);
}

// ---------------------------------------------------------------- wall + sand curb
export function createWall(scene: THREE.Scene) {
  const len = WALL.x1 - WALL.x0;
  const tex = wallTexture();
  tex.repeat.set(len / 9, 1);
  const plaster = pbr('plastered_wall_02', 2.23);
  plaster.normalMap.repeat.set(len / 2.23, WALL.height / 2.23);
  plaster.roughnessMap.repeat.copy(plaster.normalMap.repeat);
  const wallMat = new THREE.MeshStandardMaterial({
    map: tex,
    normalMap: plaster.normalMap,
    roughnessMap: plaster.roughnessMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
  });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, WALL.height, WALL.thick), wallMat);
  wall.position.set((WALL.x0 + WALL.x1) / 2, WALL.height / 2 - 0.05, WALL.z);
  wall.castShadow = wall.receiveShadow = true;
  scene.add(wall);

  // Gabled tile roof as an extruded profile.
  const shape = new THREE.Shape();
  shape.moveTo(-0.62, 0);
  shape.lineTo(0.62, 0);
  shape.lineTo(0.62, 0.06);
  shape.lineTo(0.06, 0.34);
  shape.lineTo(-0.06, 0.34);
  shape.lineTo(-0.62, 0.06);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: len + 0.6, bevelEnabled: false });
  roofGeo.rotateY(Math.PI / 2);
  const tiles = pbr('clay_roof_tiles', 4);
  for (const t of Object.values(tiles)) t.rotation = Math.PI / 2;
  const roof = new THREE.Mesh(roofGeo, regrade(new THREE.MeshStandardMaterial({ ...tiles, metalness: 0.15 }), 0.08, '#c4c8cf'));
  roof.position.set(WALL.x0 - 0.3, WALL.height - 0.05, WALL.z);
  roof.castShadow = roof.receiveShadow = true;
  scene.add(roof);
  const ridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, len + 0.7, 10),
    new THREE.MeshStandardMaterial({ color: '#3a3c3f', roughness: 0.5 }),
  );
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set((WALL.x0 + WALL.x1) / 2, WALL.height + 0.3, WALL.z);
  scene.add(ridge);

  // Low stone curb around the raked sand.
  const outer = roundedRect(SAND.hx + 0.22, SAND.hz + 0.22, SAND.r + 0.22);
  outer.holes.push(roundedRect(SAND.hx, SAND.hz, SAND.r));
  const curbGeo = new THREE.ExtrudeGeometry(outer, {
    depth: 0.1,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 2,
    curveSegments: 10,
  });
  curbGeo.rotateX(-Math.PI / 2);
  const curbMat = new THREE.MeshStandardMaterial({ color: '#8d8a83', roughness: 0.9 });
  stoneDetail(curbMat, 10, 0.6);
  const curb = new THREE.Mesh(curbGeo, curbMat);
  curb.position.set(SAND.cx, -0.03, SAND.cz);
  curb.castShadow = curb.receiveShadow = true;
  scene.add(curb);
}

function roundedRect(hx: number, hz: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz);
  s.quadraticCurveTo(hx, -hz, hx, -hz + r);
  s.lineTo(hx, hz - r);
  s.quadraticCurveTo(hx, hz, hx - r, hz);
  s.lineTo(-hx + r, hz);
  s.quadraticCurveTo(-hx, hz, -hx, hz - r);
  s.lineTo(-hx, -hz + r);
  s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
  return s;
}

export function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
