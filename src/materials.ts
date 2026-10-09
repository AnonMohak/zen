import * as THREE from 'three';
import { Q } from './quality';
import { swayVertex, uTime, withWorldPos } from './shaders';

// ImageBitmapLoader decodes images off the main thread (TextureLoader decodes
// them on the main thread at upload). THREE.Cache shares one download per file.
THREE.Cache.enabled = true;
const loader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' });
const BASE = `${import.meta.env.BASE_URL}textures/`;
const upgrades: (() => void)[] = [];

function loadInto(t: THREE.Texture, url: string) {
  loader.load(url, (bitmap) => {
    t.image = bitmap;
    t.needsUpdate = true;
  });
}

// One texture object per use (each needs its own repeat). With `hiFile`, the
// texture starts at low resolution and swaps in the large image later.
function tex(file: string, color: boolean, hiFile?: string) {
  const t = new THREE.Texture();
  t.flipY = false; // already flipped by the bitmap decoder
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Q.aniso;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  loadInto(t, BASE + file);
  if (hiFile) upgrades.push(() => loadInto(t, BASE + hiFile));
  return t;
}

// Loads the 2k images once the garden is on screen.
export function upgradeTextures() {
  for (const run of upgrades.splice(0)) run();
}

export type Pbr = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };

// A Poly Haven texture set. `metres`: real-world size of one tile.
// Blender models carry UVs in metres, so repeat = 1 / metres.
// Colour and normal maps start at 1k and upgrade to `res`; roughness stays 1k.
export function pbr(name: string, metres = 1, res = Q.tex): Pbr {
  const hi = (map: string) => (res === '1k' ? undefined : `${name}_${map}_${res}.webp`);
  const set = {
    map: tex(`${name}_diff_1k.webp`, true, hi('diff')),
    normalMap: tex(`${name}_nor_1k.webp`, false, hi('nor')),
    roughnessMap: tex(`${name}_rough_1k.webp`, false),
  };
  for (const t of Object.values(set)) t.repeat.set(1 / metres, 1 / metres);
  return set;
}

// Pulls a texture toward grey and multiplies a tint (roof tiles, gravel).
export function regrade(mat: THREE.MeshStandardMaterial, saturation: number, tint: THREE.ColorRepresentation) {
  const c = new THREE.Color(tint);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r);
    s.fragmentShader = s.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, ${saturation.toFixed(2)})
        * vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)});`,
    );
  };
  return mat;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function canvasTex(c: HTMLCanvasElement, color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Q.aniso;
  return t;
}

// Shoji panel (UV 0..1 over one sliding door): paper, kumiko lattice, wooden kick plate.
function shojiTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#f3efe2';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(200,190,160,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 3, 2);
  }
  const wood = '#5b4330';
  g.fillStyle = wood;
  const frame = 12;
  g.fillRect(0, 0, 256, frame);
  g.fillRect(0, 512 - frame, 256, frame);
  g.fillRect(0, 0, frame, 512);
  g.fillRect(256 - frame, 0, frame, 512);
  g.fillRect(0, 420, 256, 92); // koshi-ita kick plate
  for (let k = 1; k < 3; k++) g.fillRect((k * 256) / 3 - 2, 0, 4, 420);
  for (let k = 1; k < 7; k++) g.fillRect(0, (k * 420) / 7 - 2, 256, 4);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 20; x < 256; x += 18) g.fillRect(x, 430, 2, 72);
  return canvasTex(c);
}

// Tatami: woven igusa straw with a dark cloth border every 0.91 m (UV in metres).
function tatamiTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#b3a86a';
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 3) {
    g.fillStyle = `rgba(${90 + Math.random() * 40},${85 + Math.random() * 40},40,0.35)`;
    g.fillRect(0, y, 512, 1);
  }
  g.fillStyle = '#2d2a22';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 256, 512, 10);
  return canvasTex(c);
}

// Bamboo culm along V (metres): green with pale nodes every ~0.3 m.
function bambooTexture(dry: boolean) {
  const [c, g] = canvas(64, 256);
  const base = dry ? [168, 140, 92] : [104, 128, 58];
  for (let y = 0; y < 256; y++) {
    const k = 0.9 + Math.random() * 0.15;
    g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
    g.fillRect(0, y, 64, 1);
  }
  for (let x = 0; x < 64; x += 4) {
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(x, 0, 1, 256);
  }
  g.fillStyle = dry ? 'rgba(90,70,40,0.8)' : 'rgba(200,210,150,0.8)';
  g.fillRect(0, 0, 64, 5);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 5, 64, 2);
  return canvasTex(c);
}

// Pine needle tuft with alpha: dark green needles radiating from a point.
export function needleTexture() {
  const [c, g] = canvas(128, 128);
  g.translate(64, 64);
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 32;
    const v = 30 + Math.random() * 50;
    g.strokeStyle = `rgb(${v * 0.5},${v + 25},${v * 0.4})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    g.stroke();
  }
  return canvasTex(c);
}

let cachedMats: Record<string, THREE.Material> | null = null;

// Materials for the Blender Edo models, keyed by Blender material name.
export function edoMaterials() {
  if (cachedMats) return cachedMats;
  const wood = pbr('dark_wooden_planks', 2);
  const stone = pbr('rock_01', 1.5);
  const plaster = pbr('plastered_wall_02', 2.23);
  const roof = pbr('clay_roof_tiles', 4);
  const pineBark = pbr('knotted_pine_bark', 1.7, '1k');
  const tatami = tatamiTexture();
  tatami.repeat.set(1 / 1.82, 1 / 1.82);
  const bamboo = bambooTexture(false);
  const bambooDry = bambooTexture(true);
  for (const t of [bamboo, bambooDry]) t.repeat.set(1 / 0.35, 1 / 0.3);

  const foliage = new THREE.MeshStandardMaterial({ color: '#2a4119', roughness: 0.9 });
  foliage.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${swayVertex(2.0, 0.002)}`);
    withWorldPos(s);
    s.fragmentShader = s.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      {
        float nz = vnoise3(vWPos * 14.0) * 0.6 + vnoise3(vWPos * 40.0) * 0.4;
        float rim = 1.0 - abs(dot(normalize(vViewPosition), normal));
        if (nz < rim * 1.3 - 0.2) discard;
        diffuseColor.rgb *= 0.6 + 0.6 * nz;
      }`,
    );
  };

  cachedMats = {
    Wood: new THREE.MeshStandardMaterial({ ...wood, color: '#d8c0a8' }),
    DarkWood: new THREE.MeshStandardMaterial({ ...wood, color: '#8a7466' }),
    Stone: new THREE.MeshStandardMaterial({ ...stone }),
    Plaster: new THREE.MeshStandardMaterial({ ...plaster, color: '#fbf6ea' }),
    Roof: regrade(new THREE.MeshStandardMaterial({ ...roof, metalness: 0.15 }), 0.08, '#c4c8cf'),
    Shoji: new THREE.MeshStandardMaterial({
      map: shojiTexture(),
      side: THREE.DoubleSide,
      roughness: 0.9,
      emissive: new THREE.Color('#fff4e0'),
      emissiveIntensity: 0.12,
    }),
    Tatami: new THREE.MeshStandardMaterial({ map: tatami, roughness: 0.85 }),
    Bamboo: new THREE.MeshStandardMaterial({ map: bamboo, roughness: 0.45 }),
    BambooDry: new THREE.MeshStandardMaterial({ map: bambooDry, roughness: 0.6 }),
    Rope: new THREE.MeshStandardMaterial({ color: '#16110c', roughness: 0.9 }),
    Water: new THREE.MeshStandardMaterial({ color: '#1d2f2c', roughness: 0.05, envMapIntensity: 1.5 }),
    Foliage: foliage,
    Needles: new THREE.MeshStandardMaterial({
      map: needleTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8,
      color: '#c8d8b0',
    }),
    PineBark: new THREE.MeshStandardMaterial({ ...pineBark }),
    Lacquer: new THREE.MeshStandardMaterial({ color: '#9a2a17', roughness: 0.45 }),
    Gold: new THREE.MeshStandardMaterial({ color: '#b48a3c', metalness: 1, roughness: 0.35 }),
  } as Record<string, THREE.Material>;
  return cachedMats;
}

// Swaps glTF placeholder materials for the Edo materials and sets up shadows.
export function applyEdoMaterials(root: THREE.Object3D, cast = true) {
  const mats = edoMaterials();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = (m.material as THREE.Material).name.replace(/\.\d+$/, '');
    if (mats[name]) m.material = mats[name];
    m.castShadow = cast && name !== 'Needles';
    m.receiveShadow = true;
  });
}
