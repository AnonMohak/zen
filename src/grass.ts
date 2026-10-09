import * as THREE from 'three';
import { FENCE, WALL, groundHeight, pondE, sandSdf, templeSdf } from './layout';
import { mulberry } from './scenery';
import { uTime } from './shaders';

// Instanced grass blades on the moss outside the sand, in noisy clumps.
export function createGrass(scene: THREE.Scene, count = 110000) {
  const h = 1;
  const geo = new THREE.PlaneGeometry(0.03, h, 1, 4);
  geo.translate(0, h / 2, 0);
  const p = geo.attributes.position;
  const colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h;
    p.setX(i, p.getX(i) * (1 - y * 0.85));
    p.setZ(i, y * y * 0.12);
    const c = new THREE.Color('#1d300c').lerp(new THREE.Color('#9db35a'), y);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float k = position.y * position.y;
          float w = sin(uTime * 1.3 + ip.x * 0.6 + ip.z * 0.3) * 0.5 + sin(uTime * 2.7 + ip.x * 1.7) * 0.2;
          transformed.x += w * k * 0.18;
          transformed.z += cos(uTime * 1.1 + ip.z * 0.5) * k * 0.08;
        }`,
      );
    // Lighter normals so blades do not go black when seen edge-on.
    s.fragmentShader = s.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, 0.6));',
    );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rnd = mulberry(11);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const tint = new THREE.Color();
  let n = 0;
  let tries = 0;
  while (n < count && tries < count * 30) {
    tries++;
    const r = 34 * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    const x = 2 + Math.cos(a) * r;
    const z = -2 + Math.sin(a) * r;
    if (sandSdf(x, z) < 0.35) continue;
    const pe = pondE(x, z);
    if (pe < 1.12) continue;
    if (Math.abs(z - WALL.z) < 0.45 && x > WALL.x0 - 0.2 && x < FENCE.x + 0.2) continue;
    if (Math.abs(x - FENCE.x) < 0.3 && z > FENCE.z0 && z < FENCE.z1) continue;
    if (templeSdf(x, z) < 0.2) continue;
    // clumps: denser near the pond and in noisy patches
    const patch = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(z * 0.7) * 2) * Math.sin(z * 1.1 + x * 0.3);
    const nearPond = pe < 1.8 ? 0.35 : 0;
    if (rnd() > patch * patch + nearPond + 0.12) continue;
    const s = 0.05 + rnd() * rnd() * 0.16 + nearPond * 0.18;
    e.set((rnd() - 0.5) * 0.3, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, groundHeight(x, z) - 0.01, z), q, new THREE.Vector3(1, s, 1));
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, tint.setHSL(0.15 + rnd() * 0.12, 0.35, 0.7 + rnd() * 0.3));
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
