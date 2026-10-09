import * as THREE from 'three';
import { loadModel } from './gltf';
import { POND, WATER_Y } from './layout';
import { uTime, withWorldPos } from './shaders';

// Pond surface: dark, glossy water with moving ripples and Fresnel opacity.
export function createWater(scene: THREE.Scene) {
  const geo = new THREE.CircleGeometry(1, 96);
  geo.rotateX(-Math.PI / 2);
  geo.scale(POND.rx * 1.08, 1, POND.rz * 1.08);
  const mat = new THREE.MeshStandardMaterial({
    color: '#22403f',
    roughness: 0.04,
    metalness: 0.0,
    transparent: true,
    envMapIntensity: 1.3,
  });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    withWorldPos(s);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          vec2 p = vWPos.xz;
          float t = uTime;
          vec2 g = vec2(0.0);
          g += vec2(cos(p.x * 3.1 + t * 0.9), 0.0) * 0.5;
          g += vec2(0.0, cos(p.y * 2.7 - t * 0.7)) * 0.5;
          g += vec2(cos((p.x + p.y) * 5.3 + t * 1.3)) * 0.25;
          g += (vec2(vnoise(p * 4.0 + t * 0.3), vnoise(p * 4.0 - t * 0.27 + 7.0)) - 0.5) * 1.2;
          normal = normalize(normal - (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.035);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
        diffuseColor.a = mix(0.62, 0.97, fres);
        #include <opaque_fragment>`,
      );
  };
  const water = new THREE.Mesh(geo, mat);
  water.position.set(POND.cx, WATER_Y, POND.cz);
  water.receiveShadow = true;
  scene.add(water);
}

type Koi = { mesh: THREE.Mesh; speed: number; phase: number; ax: number; az: number; wob: number; depth: number };

// Koi swim slow loops under the surface. The body bends in a vertex shader.
export async function createKoi(scene: THREE.Scene) {
  const gltf = await loadModel('koi');
  const src: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => (o as THREE.Mesh).isMesh && src.push(o as THREE.Mesh));

  const fish: Koi[] = [];
  const specs = [0, 1, 2, 0, 2, 1];
  specs.forEach((k, i) => {
    const phase = { value: i * 1.7 };
    const swim = { value: 1 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = uTime;
      s.uniforms.uPhase = phase;
      s.uniforms.uSwim = swim;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uPhase, uSwim;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          float tail = smoothstep(0.2, -0.45, transformed.x);
          transformed.z += sin(transformed.x * 9.0 - uTime * 5.0 * uSwim + uPhase) * 0.045 * tail;`,
        );
    };
    const mesh = new THREE.Mesh(src[k].geometry, mat);
    mesh.scale.setScalar(0.85 + (i % 3) * 0.15);
    mesh.castShadow = false;
    scene.add(mesh);
    fish.push({
      mesh,
      speed: 0.09 + (i % 3) * 0.025,
      phase: i * 1.1,
      ax: 0.45 + 0.1 * (i % 2),
      az: 0.5 - 0.08 * (i % 3),
      wob: 1.3 + i * 0.37,
      depth: WATER_Y - 0.12 - (i % 3) * 0.06,
    });
  });

  const pos = (f: Koi, t: number) => {
    const a = t * f.speed + f.phase;
    return new THREE.Vector2(
      POND.cx + Math.cos(a) * POND.rx * f.ax + Math.sin(a * f.wob) * 0.4,
      POND.cz + Math.sin(a * 1.0) * POND.rz * f.az + Math.cos(a * f.wob * 0.7) * 0.3,
    );
  };

  return (t: number) => {
    for (const f of fish) {
      const p = pos(f, t);
      const q = pos(f, t + 0.2);
      f.mesh.position.set(p.x, f.depth, p.y);
      f.mesh.rotation.y = Math.atan2(-(q.y - p.y), q.x - p.x);
    }
  };
}
