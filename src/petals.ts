import * as THREE from 'three';
import { WATER_Y, groundHeight, isInWater } from './layout';
import { petalTexture } from './textures';

type Petal = {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  fall: number;
  phase: number;
  resting: boolean;
  timer: number;
  life: number;
  size: number;
};

const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Falling cherry petals: they flutter down in the wind, rest on the ground or
// drift on the pond for a while, shrink away, and start again in a tree.
export function createPetals(scene: THREE.Scene, spawn: THREE.Vector3[], count = 3500) {
  const geo = new THREE.PlaneGeometry(0.08, 0.08, 3, 3);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const y = pa.getY(i);
    pa.setZ(i, x * x * 6 - y * 0.12);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: petalTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.75,
    emissive: new THREE.Color('#ffb3c6'),
    emissiveIntensity: 0.12,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  scene.add(mesh);

  const tint = new THREE.Color();
  const petals: Petal[] = [];
  const respawn = (pt: Petal) => {
    const s = spawn[(Math.random() * spawn.length) | 0];
    pt.p.set(s.x + (Math.random() - 0.5) * 0.3, s.y, s.z + (Math.random() - 0.5) * 0.3);
    pt.q.setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
    pt.axis.randomDirection();
    pt.spin = 1.5 + Math.random() * 4;
    pt.fall = 0.28 + Math.random() * 0.22;
    pt.resting = false;
    pt.life = 0;
  };
  const land = (pt: Petal) => {
    pt.resting = true;
    pt.timer = 10 + Math.random() * 25;
    pt.q.copy(FLAT).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.3));
  };
  for (let i = 0; i < count; i++) {
    const pt: Petal = {
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      axis: new THREE.Vector3(),
      spin: 0,
      fall: 0,
      phase: Math.random() * 100,
      resting: false,
      timer: 0,
      life: 1,
      size: 0.7 + Math.random() * 0.6,
    };
    respawn(pt);
    pt.life = 1;
    // Start the scene mid-fall, with some petals already on the ground.
    const gy = groundHeight(pt.p.x, pt.p.z);
    if (Math.random() < 0.35) {
      pt.p.x += (Math.random() - 0.3) * 3;
      pt.p.z += (Math.random() - 0.5) * 3;
      pt.p.y = Math.max(groundHeight(pt.p.x, pt.p.z), WATER_Y) + 0.004;
      land(pt);
      pt.timer *= Math.random();
    } else {
      pt.p.y = gy + (pt.p.y - gy) * Math.random();
    }
    petals.push(pt);
    mesh.setColorAt(i, tint.setHSL(0.95 + Math.random() * 0.04, 0.6, 0.88 + Math.random() * 0.12));
  }

  const m = new THREE.Matrix4();
  const dq = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  return (dt: number, t: number) => {
    const windX = 0.32 + 0.22 * Math.sin(t * 0.13) + 0.12 * Math.sin(t * 0.41);
    const windZ = 0.12 * Math.sin(t * 0.07 + 1);
    for (let i = 0; i < count; i++) {
      const pt = petals[i];
      let scale = pt.size;
      if (!pt.resting) {
        pt.life += dt;
        const ph = pt.phase;
        pt.p.x += (windX + Math.sin(t * 1.3 + ph) * 0.22) * dt;
        pt.p.z += (windZ + Math.cos(t * 1.1 + ph * 1.7) * 0.22) * dt;
        pt.p.y -= (pt.fall + Math.sin(t * 2.3 + ph) * 0.15) * dt;
        pt.q.multiply(dq.setFromAxisAngle(pt.axis, pt.spin * dt));
        const water = isInWater(pt.p.x, pt.p.z);
        const floor = water ? WATER_Y + 0.004 : groundHeight(pt.p.x, pt.p.z) + 0.006;
        if (pt.p.y <= floor) {
          pt.p.y = floor;
          land(pt);
        }
        scale *= Math.min(1, pt.life * 2);
        if (Math.abs(pt.p.x) > 45 || Math.abs(pt.p.z) > 45) respawn(pt);
      } else {
        pt.timer -= dt;
        if (isInWater(pt.p.x, pt.p.z)) {
          pt.p.x += 0.04 * dt;
          pt.p.z += Math.sin(t * 0.2 + pt.phase) * 0.03 * dt;
          pt.p.y = WATER_Y + 0.004 + Math.sin(t * 1.5 + pt.p.x * 3) * 0.003;
        }
        scale *= Math.min(1, pt.timer / 1.5);
        if (pt.timer <= 0) respawn(pt);
      }
      m.compose(pt.p, pt.q, sc.setScalar(Math.max(scale, 0.0001)));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}
